'use client'

import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { AddressBookIcon, MagnifyingGlassIcon, PaperPlaneTiltIcon, UserPlusIcon } from '@phosphor-icons/react'
import { formatDate } from '@/lib/utils'
import { PageHeader } from '@/components/ui/page-header'
import { Avatar } from '@/components/ui/avatar'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { EmptyState, Skeleton } from '@/components/ui/states'
import { AddContactModal } from '@/components/ui/add-contact-modal'
import { ContactDialog, type ContactTarget } from '@/components/contacts/contact-dialog'
import { Pager } from '@/components/ui/pagination'
import { TABLE_PAGE_SIZE, usePagination } from '@/lib/use-pagination'

const TAG_TONE: Record<string, BadgeTone> = {
  client:     'info',
  enterprise: 'violet',
  partner:    'success',
  prospect:   'warning',
  ecommerce:  'info',
  logistics:  'neutral',
}

const tagTone = (tag: string): BadgeTone => TAG_TONE[tag.toLowerCase()] ?? 'neutral'


export default function ContactsPage() {
  const [contactModalOpen, setContactModalOpen] = useState(false)
  const contactsData = useQuery(api.contacts.list)
  const createContact = useMutation(api.contacts.create)
  const loading = contactsData === undefined
  const contacts = contactsData ?? []
  const [query, setQuery] = useState('')
  const [viewing, setViewing] = useState<ContactTarget | null>(null)

  const q = query.trim().toLowerCase()
  const visible = q
    ? contacts.filter((c) =>
        [c.name, c.company, c.email, c.phone, ...c.tags].some((v) => v?.toLowerCase().includes(q)),
      )
    : contacts
  const pages = usePagination(visible, TABLE_PAGE_SIZE, q)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Relationships"
        title="Contacts"
        description={`${contacts.length} clients, partners and prospects`}
        actions={
          <button onClick={() => setContactModalOpen(true)} className="btn btn-primary">
            <UserPlusIcon size={17} weight="bold" />
            Add contact
          </button>
        }
      />

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5 md:p-6">
          <div>
            <h2 className="font-display text-[17px] font-semibold text-fg">Directory</h2>
            <p className="mt-1 text-[12.5px] text-fg-3">
              {q ? `${visible.length} of ${contacts.length} shown` : 'Everyone you work with'}
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <MagnifyingGlassIcon size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-3" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, company, tag…"
              className="input has-icon h-10 rounded-full"
              aria-label="Search contacts"
            />
          </div>
        </div>

        {loading ? (
          <div className="space-y-2 border-t border-line p-5">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={AddressBookIcon}
            title={q ? 'No matches' : 'No contacts yet'}
            description={q ? 'Try a different name, company or tag.' : 'Add clients and prospects to keep their details in one place.'}
            className="border-t border-line"
          />
        ) : (
          <div className="overflow-x-auto border-t border-line">
            <table className="w-full min-w-[760px] text-left text-[13px]">
              <thead>
                <tr className="text-[11.5px] font-medium text-fg-3">
                  <th className="px-6 py-3 font-medium">Name</th>
                  <th className="px-3 py-3 font-medium">Company</th>
                  <th className="px-3 py-3 font-medium">Tags</th>
                  <th className="px-3 py-3 font-medium">Phone</th>
                  <th className="px-3 py-3 text-right font-medium">Added</th>
                  <th className="w-14 px-6 py-3"><span className="sr-only">Email</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line border-t border-line">
                {pages.pageItems.map((contact) => (
                  <tr key={contact.id} className="trow cursor-pointer align-middle" onClick={() => setViewing({ id: contact.id, name: contact.name })}>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <Avatar name={contact.name} size={38} />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-fg">{contact.name}</p>
                          {contact.email ? (
                            <a href={`mailto:${contact.email}`} onClick={(e) => e.stopPropagation()} className="block truncate text-[12px] text-fg-3 hover:text-brand">
                              {contact.email}
                            </a>
                          ) : (
                            <p className="text-[12px] text-fg-3">No email</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3.5">
                      <p className="font-medium text-fg-2">{contact.company || '—'}</p>
                      {contact.notes && (
                        <p className="line-clamp-1 max-w-[16rem] text-[11.5px] text-fg-3" title={contact.notes}>{contact.notes}</p>
                      )}
                    </td>
                    <td className="px-3 py-3.5">
                      <div className="flex flex-wrap gap-1.5">
                        {contact.tags.map((tag) => (
                          <Badge key={tag} tone={tagTone(tag)} className="capitalize">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="tabular whitespace-nowrap px-3 py-3.5 text-fg-2">
                      {contact.phone ? <a href={`tel:${contact.phone}`} onClick={(e) => e.stopPropagation()} className="hover:text-brand">{contact.phone}</a> : '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 text-right text-[12px] text-fg-3">
                      {contact.createdAt ? formatDate(contact.createdAt) : '—'}
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      {contact.email && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setViewing({ id: contact.id, name: contact.name, compose: true })
                          }}
                          className="icon-btn icon-btn-sm"
                          aria-label={`Email ${contact.name}`}
                          title="Send email"
                        >
                          <PaperPlaneTiltIcon size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pager pagination={pages} className="border-t border-line px-6 py-3" />
          </div>
        )}
      </div>

      <ContactDialog target={viewing} tagTone={tagTone} onClose={() => setViewing(null)} />

      <AddContactModal
        open={contactModalOpen}
        onClose={() => setContactModalOpen(false)}
        onAdd={(form) => {
          const tags = form.tags ? form.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : []
          void createContact({ ...form, tags })
        }}
      />
    </div>
  )
}
