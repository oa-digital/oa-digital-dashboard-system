'use client'

import { useState } from 'react'
import { useQuery } from 'convex/react'
import { CalendarPlusIcon, VideoCameraIcon } from '@phosphor-icons/react'
import { api } from '@/convex/_generated/api'
import { PageHeader } from '@/components/ui/page-header'
import { Segmented } from '@/components/ui/segmented'
import { Card } from '@/components/ui/card'
import { EmptyState, PageSkeleton } from '@/components/ui/states'
import { MeetingDialog } from '@/components/meetings/meeting-dialog'
import { MeetingList } from '@/components/meetings/meeting-list'
import { GoogleNotice, useGoogleConnected } from '@/components/meetings/google-notice'
import { useNow } from '@/lib/use-now'

type Tab = 'upcoming' | 'past' | 'cancelled'

export default function MeetingsPage() {
  const meetings = useQuery(api.meetings.list, {})
  const connected = useGoogleConnected()
  const [tab, setTab] = useState<Tab>('upcoming')
  const [scheduling, setScheduling] = useState(false)
  const now = useNow()

  const header = (
    <PageHeader
      eyebrow="Work"
      title="Meetings"
      description="Google Meet calls with the team, clients and anyone else."
      actions={
        <button onClick={() => setScheduling(true)} disabled={!connected} className="btn btn-primary">
          <CalendarPlusIcon size={17} weight="bold" />
          Schedule meeting
        </button>
      }
    />
  )

  if (!meetings) {
    return (
      <div className="space-y-6">
        {header}
        <PageSkeleton rows={1} />
      </div>
    )
  }

  const upcoming = meetings.filter((m) => m.status === 'scheduled' && m.endAt >= now)
  const past = meetings.filter((m) => m.status === 'scheduled' && m.endAt < now).reverse()
  const cancelled = meetings.filter((m) => m.status === 'cancelled').reverse()
  const shown = tab === 'upcoming' ? upcoming : tab === 'past' ? past : cancelled

  return (
    <div className="space-y-6">
      {header}
      <GoogleNotice what="Scheduling meetings" />

      <Segmented
        label="Meetings"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'upcoming', label: 'Upcoming', count: upcoming.length },
          { value: 'past', label: 'Past', count: past.length },
          ...(cancelled.length ? [{ value: 'cancelled' as const, label: 'Cancelled', count: cancelled.length }] : []),
        ]}
      />

      <Card flush>
        {shown.length === 0 ? (
          <EmptyState
            icon={VideoCameraIcon}
            title={tab === 'upcoming' ? 'Nothing scheduled' : tab === 'past' ? 'No past meetings' : 'Nothing cancelled'}
            description={tab === 'upcoming' ? 'Meetings you organise or are invited to show up here.' : undefined}
            action={
              tab === 'upcoming' && connected ? (
                <button onClick={() => setScheduling(true)} className="btn btn-primary">
                  <CalendarPlusIcon size={16} weight="bold" />
                  Schedule meeting
                </button>
              ) : undefined
            }
          />
        ) : (
          <MeetingList meetings={shown} resetKey={tab} />
        )}
      </Card>

      <MeetingDialog open={scheduling} onClose={() => setScheduling(false)} />
    </div>
  )
}
