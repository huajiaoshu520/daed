FROM node:alpine AS build-web

WORKDIR /build
COPY . .

# Node Alpine 当前镜像可能不自带 corepack，先通过 npm 安装
RUN npm install -g corepack
RUN corepack enable
RUN corepack prepare pnpm@10.24.0 --activate

RUN pnpm install --frozen-lockfile
RUN pnpm build


# Build the official release at a verified commit; keep its Go dependencies
# isolated from wing. Xray v26.10.31 requires Go 1.27.
FROM golang:1.27-bookworm AS build-xray
ENV CGO_ENABLED=0
WORKDIR /build/xray
RUN git clone --depth 1 --branch v26.10.31 https://github.com/XTLS/Xray-core.git . \
    && test "$(git rev-parse HEAD)" = "a4a3dff5b20c2faae567b742c172c7b95e75c083" \
    && go build -trimpath -ldflags="-s -w" -o /usr/local/bin/xray ./main

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
COPY --from=build-xray /usr/local/bin/xray /usr/local/bin/xray
RUN go test ./component/xray ./component/xraycore ./component/geodata
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
RUN go test ./graphql -run TestXrayCoreSchema -count=1


FROM alpine

RUN apk add --no-cache ca-certificates

LABEL org.opencontainers.image.source="https://github.com/longdongqiang-jason/daed"

RUN mkdir -p /usr/local/share/daed/ && \
    mkdir -p /etc/daed/

RUN wget -O /usr/local/share/daed/geoip.dat \
        https://github.com/v2rayA/dist-v2ray-rules-dat/raw/master/geoip.dat && \
    wget -O /usr/local/share/daed/geosite.dat \
        https://github.com/v2rayA/dist-v2ray-rules-dat/raw/master/geosite.dat

COPY --from=build-bundle /build/wing/daed /usr/local/bin/daed

COPY --from=build-xray /usr/local/bin/xray /usr/local/bin/xray
COPY --from=build-xray /build/xray/LICENSE /usr/local/share/licenses/xray/LICENSE

ENV DAED_RESTART_ON_GEODATA=1

EXPOSE 2023

CMD ["daed", "run", "-c", "/etc/daed"]
