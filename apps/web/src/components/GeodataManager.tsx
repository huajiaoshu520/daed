import { useMutation, useQuery } from '@tanstack/react-query'
import { Database } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '~/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { useGQLQueryClient } from '~/contexts'

interface GeodataStatus {
  daily: boolean
  running: boolean
  error: string
  files: { name: string; path: string; updated: string }[]
}

export function GeodataManager() {
  const { t } = useTranslation()
  const client = useGQLQueryClient()
  const [open, setOpen] = useState(false)
  const status = useQuery({
    queryKey: ['geodataStatus'],
    queryFn: async () =>
      (
        await client.request<{ geodataStatus: GeodataStatus }>(
          'query GeodataStatus { geodataStatus { daily running error files { name path updated } } }',
        )
      ).geodataStatus,
    enabled: open,
    refetchInterval: (query) => (query.state.data?.running ? 1000 : 5000),
    retry: false,
  })
  const action = useMutation({
    mutationFn: async (daily?: boolean) => {
      if (daily === undefined) {
        await client.request('mutation UpdateGeodata { updateGeodata }')
      } else {
        await client.request('mutation SetGeodataDaily($enabled: Boolean!) { setGeodataDaily(enabled: $enabled) }', {
          enabled: daily,
        })
      }
    },
    onSettled: async () => {
      await status.refetch()
    },
  })
  const error = action.error?.message || status.error?.message || status.data?.error

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
            <div className="flex flex-wrap gap-2">
              <Button disabled={action.isPending || status.data.running} onClick={() => action.mutate(undefined)}>
                {t(status.data.running ? 'geodata.updating' : 'geodata.update')}
              </Button>
              <Button
                variant="outline"
                disabled={action.isPending}
                onClick={() => action.mutate(!status.data?.daily)}
              >
                {t(status.data.daily ? 'geodata.disableDaily' : 'geodata.enableDaily')}
              </Button>
            </div>
          )}
          {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
        </DialogContent>
      </Dialog>
    </>
  )
}
