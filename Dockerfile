FROM node:alpine AS build-web

WORKDIR /build
COPY . .

# Node Alpine 当前镜像可能不自带 corepack，先通过 npm 安装
RUN npm install -g corepack
RUN corepack enable
RUN corepack prepare pnpm@10.24.0 --activate

RUN pnpm install --frozen-lockfile
RUN pnpm build


FROM golang:1.26-bookworm AS build-bundle

RUN \
    apt-get update; \
    apt-get install -y git make llvm-15 clang-15; \
    apt-get clean autoclean && \
    apt-get autoremove -y && \
    rm -rf /var/lib/{apt,dpkg,cache,log}/

ENV CGO_ENABLED=0
ENV CLANG=clang-15

ARG DAED_VERSION=self-build

COPY --from=build-web /build/apps/web/dist /build/web
COPY --from=build-web /build/wing /build/wing

WORKDIR /build/wing
RUN cd /build/wing && \
    echo "===== dae dependency =====" && \
    go list -m github.com/daeuniverse/dae && \
    echo "===== Marshaller =====" && \
    grep -Rni "type Marshaller" . $(go env GOPATH)/pkg/mod/github.com/daeuniverse 2>/dev/null | head -20 && \
    echo "===== Bytes =====" && \
    grep -Rni "func.*Bytes" . $(go env GOPATH)/pkg/mod/github.com/daeuniverse 2>/dev/null | head -30
RUN make \
    APPNAME=daed \
    VERSION=$DAED_VERSION \
    OUTPUT=daed \
    WEB_DIST=/build/web/ \
    bundle


FROM alpine

LABEL org.opencontainers.image.source="https://github.com/huajiaoshu520/daed"

RUN mkdir -p /usr/local/share/daed/ && \
    mkdir -p /etc/daed/

RUN wget -O /usr/local/share/daed/geoip.dat \
        https://github.com/v2rayA/dist-v2ray-rules-dat/raw/master/geoip.dat && \
    wget -O /usr/local/share/daed/geosite.dat \
        https://github.com/v2rayA/dist-v2ray-rules-dat/raw/master/geosite.dat

COPY --from=build-bundle /build/wing/daed /usr/local/bin/daed

EXPOSE 2023

CMD ["daed", "run", "-c", "/etc/daed"]
