import { events } from '../../src/db/schema/events'
import { users } from '../../src/db/schema/users'
import { faqs } from '../../src/db/schema/faqs'

export async function seedEvent(db: any, overrides: Record<string, any> = {}) {
  const [event] = await db.insert(events).values({
    slug: 'test-event-' + Math.random().toString(36).slice(2, 7),
    categoryName: 'Test Category',
    categoryPath: 'test',
    title: 'Test Event',
    status: 'published',
    isMajor: false,
    maxSlots: 100,
    registeredSlots: 0,
    ...overrides,
  }).returning()
  return event as NonNullable<typeof event>
}

export async function seedUser(db: any, overrides: Record<string, any> = {}) {
  const [user] = await db.insert(users).values({
    firebaseUid: 'firebase-' + Math.random().toString(36).slice(2, 8),
    email: 'user-' + Math.random().toString(36).slice(2, 6) + '@dlsu.edu.ph',
    name: 'Test User',
    role: 'student',
    ...overrides,
  }).returning()
  return user as NonNullable<typeof user>
}

export async function seedFaq(db: any, overrides: Record<string, any> = {}) {
  const [faq] = await db.insert(faqs).values({
    question: 'Q ' + Math.random().toString(36).slice(2, 6),
    answer: 'A',
    isActive: true,
    ...overrides,
  }).returning()
  return faq as NonNullable<typeof faq>
}
