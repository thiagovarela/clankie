import { useStore } from '@tanstack/react-store'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { clientManager } from '@/lib/client-manager'
import {
  cancelExtensionDialog,
  confirmExtensionDialog,
  extensionUIStore,
  shiftNotification,
  valueExtensionDialog,
} from '@/stores/extension-ui'

export function ExtensionUIProvider() {
  const { pendingDialog, notifications, statusByKey, widgetsByKey } = useStore(
    extensionUIStore,
    (state) => state,
  )

  const [value, setValue] = useState('')

  useEffect(() => {
    if (pendingDialog?.method === 'editor') {
      setValue(pendingDialog.prefill ?? '')
    } else {
      setValue('')
    }
  }, [pendingDialog])

  useEffect(() => {
    if (notifications.length === 0) return
    const timer = setTimeout(() => shiftNotification(), 3000)
    return () => clearTimeout(timer)
  }, [notifications])

  function sendCancel() {
    const response = cancelExtensionDialog()
    if (response.id) clientManager.sendExtensionUIResponse(response)
  }

  function sendConfirm(confirmed: boolean) {
    const response = confirmExtensionDialog(confirmed)
    if (response.id) clientManager.sendExtensionUIResponse(response)
  }

  function sendValue(nextValue: string) {
    const response = valueExtensionDialog(nextValue)
    if (response.id) clientManager.sendExtensionUIResponse(response)
  }

  const aboveWidgets = Object.values(widgetsByKey).filter(
    (w) => w.placement === 'aboveEditor',
  )
  const belowWidgets = Object.values(widgetsByKey).filter(
    (w) => w.placement === 'belowEditor',
  )

  return (
    <>
      {aboveWidgets.length > 0 && (
        <div className="fixed bottom-28 right-4 z-40 space-y-2 max-w-md">
          {aboveWidgets.map((widget) => (
            <Card key={widget.key}>
              <CardContent className="py-2 px-3">
                {widget.lines.map((line, idx) => (
                  <p key={idx} className="text-xs">
                    {line}
                  </p>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {Object.keys(statusByKey).length > 0 && (
        <div className="fixed bottom-4 left-4 z-40 flex gap-2 flex-wrap max-w-xl">
          {Object.entries(statusByKey).map(([key, text]) => (
            <span
              key={key}
              className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground"
            >
              {key}: {text}
            </span>
          ))}
        </div>
      )}

      {notifications.length > 0 && (
        <div className="fixed top-4 right-4 z-50 space-y-2 max-w-md">
          {notifications.map((notification) => (
            <Card key={notification.id}>
              <CardContent className="py-2 px-3 text-sm">
                {notification.message}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {pendingDialog &&
        (pendingDialog.method === 'select' ||
          pendingDialog.method === 'confirm' ||
          pendingDialog.method === 'input' ||
          pendingDialog.method === 'editor') && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <Card className="w-full max-w-lg">
              <CardHeader>
                <CardTitle>{pendingDialog.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {pendingDialog.method === 'confirm' && (
                  <>
                    <p className="text-sm text-muted-foreground">
                      {pendingDialog.message}
                    </p>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        onClick={() => sendConfirm(false)}
                      >
                        Cancel
                      </Button>
                      <Button onClick={() => sendConfirm(true)}>Confirm</Button>
                    </div>
                  </>
                )}

                {pendingDialog.method === 'select' && (
                  <>
                    <div className="space-y-2">
                      {pendingDialog.options.map((option) => (
                        <Button
                          key={option}
                          variant="outline"
                          className="w-full justify-start"
                          onClick={() => sendValue(option)}
                        >
                          {option}
                        </Button>
                      ))}
                    </div>
                    <div className="flex justify-end">
                      <Button variant="ghost" onClick={sendCancel}>
                        Cancel
                      </Button>
                    </div>
                  </>
                )}

                {pendingDialog.method === 'input' && (
                  <>
                    <Input
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      placeholder={pendingDialog.placeholder}
                    />
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={sendCancel}>
                        Cancel
                      </Button>
                      <Button onClick={() => sendValue(value)}>Submit</Button>
                    </div>
                  </>
                )}

                {pendingDialog.method === 'editor' && (
                  <>
                    <Textarea
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      rows={12}
                    />
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={sendCancel}>
                        Cancel
                      </Button>
                      <Button onClick={() => sendValue(value)}>Save</Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}

      {belowWidgets.length > 0 && (
        <div className="fixed bottom-16 right-4 z-40 space-y-2 max-w-md">
          {belowWidgets.map((widget) => (
            <Card key={widget.key}>
              <CardContent className="py-2 px-3">
                {widget.lines.map((line, idx) => (
                  <p key={idx} className="text-xs">
                    {line}
                  </p>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
