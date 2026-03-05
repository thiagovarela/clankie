import { Link, createFileRoute } from '@tanstack/react-router'
import {
  ChevronRight,
  Filter,
  Globe,
  KeyRound,
  Palette,
  Puzzle,
  Sparkles,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute('/settings/')({
  component: SettingsIndexPage,
})

const settingsPages = [
  {
    id: 'theme',
    title: 'Appearance',
    description: 'Choose your theme and color mode preference',
    icon: Palette,
    href: '/settings/theme',
  },
  {
    id: 'connection',
    title: 'Connection',
    description: 'Configure WebSocket connection to your clankie instance',
    icon: Globe,
    href: '/settings/connection',
  },
  {
    id: 'auth',
    title: 'Auth Providers',
    description: 'Manage AI provider authentication (OpenAI, Anthropic, etc.)',
    icon: KeyRound,
    href: '/settings/auth',
  },
  {
    id: 'scoped-models',
    title: 'Scoped Models',
    description: 'Choose which models are available in the model selector',
    icon: Filter,
    href: '/settings/scoped-models',
  },
  {
    id: 'extensions',
    title: 'Extensions',
    description: 'View loaded extensions and their tools and commands',
    icon: Puzzle,
    href: '/settings/extensions',
  },
  {
    id: 'skills',
    title: 'Skills',
    description: 'Browse available skills for the agent',
    icon: Sparkles,
    href: '/settings/skills',
  },
]

function SettingsIndexPage() {
  return (
    <div className="h-full overflow-y-auto chat-background">
      <div className="container max-w-2xl py-8 px-4">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="text-muted-foreground mt-1">
            Manage your clankie configuration
          </p>
        </div>

        <div className="space-y-3">
          {settingsPages.map((page) => {
            const Icon = page.icon
            return (
              <Link key={page.id} to={page.href}>
                <Card className="card-depth hover:border-primary/50 transition-colors cursor-pointer group">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium">{page.title}</h3>
                        <p className="text-sm text-muted-foreground truncate">
                          {page.description}
                        </p>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>

        <Card className="mt-6 card-depth">
          <CardHeader>
            <CardTitle>Quick Tips</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              <strong>Installing packages:</strong> Ask the AI in chat to
              install packages for you. For example: "install @pi/heartbeat"
            </p>
            <p>
              <strong>Connection:</strong> Make sure clankie is running and the
              web channel is enabled.
            </p>
            <p>
              <strong>Authentication:</strong> Configure at least one AI
              provider to start using the agent.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
