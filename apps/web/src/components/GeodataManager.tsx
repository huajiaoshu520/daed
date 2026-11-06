import { useMutation, useQuery } from '@tanstack/react-query'
import { Database } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '~/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { useGQLQueryClient } from '~/contexts'

interface GeodataStatus {
  daily: boolean
  running: boolean
  updateTime: string
  error: string
  files: { name: string; path: string; updated: string }[]
}

export function GeodataManager() {
  const { t } = useTranslation()
  const client = useGQLQueryClient()
  const [open, setOpen] = useState(false)
  const [time, setTime] = useState<string>()
  const status = useQuery({
    queryKey: ['geodataStatus'],
    queryFn: async () =>
      (
        await client.request<{ geodataStatus: GeodataStatus }>(
          'query GeodataStatus { geodataStatus { daily running updateTime error files { name path updated } } }',
        )
      ).geodataStatus,
    enabled: open,
    refetchInterval: (query) => (query.state.data?.running ? 1000 : 5000),
    retry: false,
  })
  const action = useMutation({
    mutationFn: async (settings?: { enabled: boolean; at: string }) => {
      if (!settings) {
        await client.request('mutation UpdateGeodata { updateGeodata }')
      } else {
        await client.request(
          'mutation SetGeodataDaily($enabled: Boolean!, $at: String!) { setGeodataDaily(enabled: $enabled, at: $at) }',
          settings,
        )
        setTime(undefined)
      }
    },
    onSettled: async () => {
      await status.refetch()
    },
  })
  const error = action.error?.message || status.error?.message || status.data?.error

  const updateTime = time ?? status.data?.updateTime ?? '04:17'

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label={t('geodata.title')}>
        <Database className="h-4 w-4" />
        <span className="hidden sm:inline">{t('geodata.title')}</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent aria-describedby="geodata-description">
          <DialogHeader>
            <DialogTitle>{t('geodata.title')}</DialogTitle>
          </DialogHeader>
          <p id="geodata-description" className="text-sm text-muted-foreground">
            {t('geodata.description')}
          </p>
          {status.data?.files.map((file) => (
            <div key={file.name} className="rounded-lg border p-3 text-sm">
              <p className="font-medium">{file.name}</p>
              <p className="break-all text-muted-foreground">{file.path || t('geodata.missing')}</p>
              {file.updated && <time dateTime={file.updated}>{new Date(file.updated).toLocaleString()}</time>}
            </div>
          ))}
          {status.data && (
            <div className="space-y-3">
              <label className="block space-y-1 text-sm">
                <span>{t('geodata.schedule')}</span>
                <Input type="time" value={updateTime} onChange={(event) => setTime(event.target.value)} />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button disabled={action.isPending || status.data.running} onClick={() => action.mutate(undefined)}>
                  {t(status.data.running ? 'geodata.updating' : 'geodata.update')}
                </Button>
                <Button variant="outline" disabled={action.isPending || !updateTime}
                  onClick={() => action.mutate({ enabled: true, at: updateTime })}>
                  {t(status.data.daily ? 'geodata.saveTime' : 'geodata.enableDaily')}
                </Button>
                {status.data.daily && (
                  <Button variant="outline" disabled={action.isPending}
                    onClick={() => action.mutate({ enabled: false, at: updateTime })}>
                    {t('geodata.disableDaily')}
                  </Button>
                )}
              </div>
            </div>
          )}
          {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
        </DialogContent>
      </Dialog>
    </>
  )
}
