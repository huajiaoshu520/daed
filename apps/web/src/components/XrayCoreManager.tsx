import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Cpu, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '~/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { useGQLQueryClient } from '~/contexts'

interface Core {
  mode: 'bundled' | 'managed' | 'system'
  path: string
  version: string
  error: string
  canRollback: boolean
}
interface Release {
  version: string
  prerelease: boolean
}
interface Task {
  id: string
  status: 'idle' | 'running' | 'succeeded' | 'failed'
  kind: string
  version: string
  phase: 'queued' | 'metadata' | 'downloading' | 'verifying' | 'extracting' | 'validating' | 'switching' | 'done'
  downloadedBytes: number
  totalBytes: number
  error: string
}
const taskFields = 'id status kind version phase downloadedBytes totalBytes error'
const fields = 'mode path version error canRollback'

export function XrayCoreManager() {
  const { t } = useTranslation()
  const client = useGQLQueryClient()
  const cache = useQueryClient()
  const [open, setOpen] = useState(false)
  const [version, setVersion] = useState('')
  const [path, setPath] = useState('')
  const [previousTaskID, setPreviousTaskID] = useState('')
  const core = useQuery({
    queryKey: ['xrayCore'],
    queryFn: async () =>
      (await client.request<{ xrayCore: Core }>(`query XrayCore { xrayCore { ${fields} } }`)).xrayCore,
    enabled: open,
    retry: false,
  })
  const releases = useQuery({
    queryKey: ['xrayReleases'],
    queryFn: async () =>
      (await client.request<{ xrayReleases: Release[] }>('query XrayReleases { xrayReleases { version prerelease } }'))
        .xrayReleases,
    enabled: open,
    retry: false,
    staleTime: 60_000,
  })
  const task = useQuery({
    queryKey: ['xrayTask'],
    queryFn: async () =>
      (await client.request<{ xrayTask: Task }>(`query XrayTask { xrayTask { ${taskFields} } }`)).xrayTask,
    enabled: open,
    refetchInterval: (query) => (query.state.data?.status === 'running' ? 1000 : 5000),
    retry: false,
  })
  const action = useMutation({
    onMutate: () => setPreviousTaskID(task.data?.id || ''),
    mutationFn: async (variables: { kind: string; version?: string; path?: string }) =>
      (
        await client.request<{ startXrayTask: Task }>(
          `mutation StartXrayTask($kind: String!, $version: String!, $path: String!) { startXrayTask(kind: $kind, version: $version, path: $path) { ${taskFields} } }`,
          { version: '', path: '', ...variables },
        )
      ).startXrayTask,
    onSuccess: (accepted) => cache.setQueryData(['xrayTask'], accepted),
    onSettled: () => {
      void task.refetch()
    },
  })
  const taskStatus = task.data?.status
  const taskID = task.data?.id
  useEffect(() => {
    if (taskStatus === 'succeeded' || taskStatus === 'failed') {
      void cache.invalidateQueries({ queryKey: ['xrayCore'] })
    }
  }, [taskID, taskStatus, cache])
  const busy = action.isPending || taskStatus === 'running'
  const unavailable = busy || task.isPending || task.isError
  const recovered = Boolean(taskID && taskID !== previousTaskID)
  const selectedVersion = version || releases.data?.find((r) => !r.prerelease)?.version || ''
  const error = task.error || core.error || (recovered && action.error instanceof TypeError ? null : action.error)
  const downloaded = ((task.data?.downloadedBytes || 0) / (1024 * 1024)).toFixed(1)
  const total = ((task.data?.totalBytes || 0) / (1024 * 1024)).toFixed(1)

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label={t('xray.title')}>
        <Cpu className="h-4 w-4" />
        <span className="hidden sm:inline">Xray</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" aria-describedby="xray-description">
          <DialogHeader>
            <DialogTitle>{t('xray.title')}</DialogTitle>
          </DialogHeader>
          <p id="xray-description" className="text-sm text-muted-foreground">
            {t('xray.description')}
          </p>
          {core.isPending ? (
            <p role="status">{t('xray.loading')}</p>
          ) : (
            core.data && (
              <div className="rounded-lg border p-3 space-y-1 text-sm">
                <p className="font-medium">Xray {core.data.version || '—'}</p>
                <p>{t(`xray.mode.${core.data.mode}`)}</p>
                <p className="break-all text-xs text-muted-foreground">{core.data.path}</p>
                {core.data.error && (
                  <p role="alert" className="text-destructive">
                    {core.data.error}
                  </p>
                )}
              </div>
            )
          )}
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex justify-between items-center">
              <h3 className="font-medium">{t('xray.managed')}</h3>
              <Button
                variant="ghost"
                size="sm"
                aria-label={t('xray.refresh')}
                disabled={releases.isFetching}
                onClick={() => void releases.refetch()}
              >
                <RefreshCw className={releases.isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
              </Button>
            </div>
            <p className="rounded-md bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
              {t('xray.warning')}
            </p>
            {releases.isPending && (
              <p role="status" className="text-sm">
                {t('xray.loading')}
              </p>
            )}
            {releases.error && (
              <p role="alert" className="text-sm text-destructive">
                {releases.error.message}
              </p>
            )}
            {releases.data?.length === 0 && <p className="text-sm">{t('xray.noReleases')}</p>}
            <fieldset disabled={unavailable} className="max-h-48 overflow-y-auto rounded-md border divide-y">
              <legend className="sr-only">{t('xray.chooseVersion')}</legend>
              {releases.data?.map((release) => (
                <label
                  key={release.version}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 cursor-pointer text-sm"
                >
                  <span>
                    {release.version}{' '}
                    {release.prerelease && <span className="text-muted-foreground">({t('xray.prerelease')})</span>}
                  </span>
                  <input
                    type="radio"
                    name="xray-version"
                    value={release.version}
                    checked={selectedVersion === release.version}
                    onChange={() => setVersion(release.version)}
                  />
                </label>
              ))}
            </fieldset>
            <Button
              className="w-full"
              loading={busy && (task.data?.kind === 'install' || action.variables?.kind === 'install')}
              disabled={unavailable || !selectedVersion}
              onClick={() =>
                action.mutate({
                  kind: 'install',
                  version: selectedVersion,
                })
              }
            >
              {t('xray.install')}
            </Button>
          </div>
          <div className="space-y-3 rounded-lg border p-4">
            <h3 className="font-medium">{t('xray.system')}</h3>
            <Input
              label={t('xray.path')}
              placeholder="/usr/bin/xray"
              value={path}
              disabled={unavailable}
              onChange={(e) => setPath(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t('xray.systemHint')}</p>
            <Button
              variant="outline"
              className="w-full"
              disabled={unavailable}
              onClick={() =>
                action.mutate({
                  kind: 'system',
                  path,
                })
              }
            >
              {t('xray.useSystem')}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={unavailable}
              onClick={() =>
                action.mutate({
                  kind: 'bundled',
                })
              }
            >
              {t('xray.useBundled')}
            </Button>
            <Button
              variant="outline"
              disabled={unavailable || !core.data?.canRollback}
              onClick={() => action.mutate({ kind: 'rollback' })}
            >
              {t('xray.rollback')}
            </Button>
          </div>
          {busy && (
            <div role="status" className="space-y-2 rounded-lg border p-3 text-sm">
              <p>{task.data?.status === 'running' ? t(`xray.phase.${task.data.phase}`) : t('xray.starting')}</p>
              {task.data?.status === 'running' && task.data.phase === 'downloading' && (
                <>
                  <p>
                    {downloaded} MB{task.data.totalBytes > 0 ? ` / ${total} MB` : ''}
                  </p>
                  {task.data.totalBytes > 0 && (
                    <progress
                      aria-label={t('xray.phase.downloading')}
                      className="w-full"
                      max={task.data.totalBytes}
                      value={task.data.downloadedBytes}
                    />
                  )}
                </>
              )}
              <p className="text-xs text-muted-foreground">{t('xray.backgroundHint')}</p>
            </div>
          )}
          {!busy && taskStatus === 'succeeded' && (
            <p role="status" className="text-sm text-green-600 dark:text-green-400">
              {t('xray.success')}
            </p>
          )}
          {task.data?.error && (
            <p role="alert" className="break-words text-sm text-destructive">
              {task.data.error}
            </p>
          )}
          {error && (
            <p role="alert" className="break-words text-sm text-destructive">
              {error instanceof TypeError && t('xray.connectionError')} {error.message}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
