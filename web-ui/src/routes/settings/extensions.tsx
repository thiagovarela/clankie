import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/settings/extensions')({
  beforeLoad: () => {
    throw redirect({
      to: '/extensions/install',
    })
  },
  component: () => null,
})
