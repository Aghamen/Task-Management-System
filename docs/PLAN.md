# Task Management System — Technical Plan

A self-hosted, Trello-style board tool for a team of 5–20 people.

Status: **Phase 1 built** (plus live updates and filters from later phases).
Items marked _(assumed)_ use a sensible default and can still be changed.

---

## 1. Decisions so far

| Topic | Decision |
|---|---|
| Team size | 5–20 users |
| Accounts | Created only by the Super Admin, who hands out login details. No self sign-up. |
| Login | Username **or** email + password. |
| Password reset | Only the Super Admin can change/reset passwords. Users can change their own password while logged in _(assumed)_. |
| Super Admin | Exactly one Super Admin account with a separate admin panel. It is management-only and does not work on boards. |
| Board roles | Same as Trello: Admin, Member, Observer. |
| Workspaces | None for now — a flat list of boards. |
| Board creation | Only the Super Admin creates boards and picks the person who becomes the board's Admin. |
| Board backgrounds | Same as Trello: preset colors, gradients, and uploaded images. |
| Templates | None. |
| Archiving | Like Trello: boards, lists and cards can be archived and restored; permanent delete is a separate action. |
| Attachment storage | Our own server (Docker volume on disk) _(assumed — 5–20 users don't need S3; can be swapped later)_. |
| Real-time updates | Yes, changes appear instantly for everyone on the board _(assumed)_. |
| Notifications | In-app only (bell icon); no email _(assumed — no email service needed)_. |
| Search / filters | Yes: filter a board by label, member, due date, keyword _(assumed)_. |
| Extra views | Board view only in phase 1; Calendar view later _(assumed)_. |
| UI language | English _(assumed)_. |
| Dark mode | Yes _(assumed)_. |
| Hosting | Subdomain on a VPS: Docker Compose behind nginx or Caddy. |
| Deadline | As soon as possible. |
| Mobile | Responsive web that works in mobile browsers; no native app _(assumed)_. |

## 2. Roles and permissions

### Super Admin (global)
- Separate panel at `/admin`.
- Create, edit, deactivate and delete user accounts; set/reset any password.
- Create boards and choose each board's Admin; see every board in the admin panel.
- Cannot open boards to work on cards (management-only account).
- Add or remove any user from any board and set their board role.
- Restore or permanently delete archived boards.
- System settings: app name/logo, max attachment size, allowed file types.

### Board roles (per board, like Trello)

| Action | Admin | Member | Observer |
|---|:-:|:-:|:-:|
| View board, cards, comments | ✓ | ✓ | ✓ |
| Create/edit/move/archive lists and cards | ✓ | ✓ | – |
| Labels, checklists, dates, attachments, assignees, custom-field values | ✓ | ✓ | – |
| Comment | ✓ | ✓ | – |
| Rename board, change background, manage labels & custom fields | ✓ | ✓ | – |
| Add/remove board members, change roles | ✓ | – | – |
| Archive the board | ✓ | – | – |
| Leave board | ✓ | ✓ | ✓ |

- Board members can only be chosen from existing user accounts (created by the Super Admin).
- A board must always keep at least one Admin.
- Users see only the boards they are members of.

## 3. Features

### Boards
- Board list (home page) with starred boards at the top.
- Title, background (color / gradient / image), star.
- Members bar with avatars; invite existing users by name.
- Archive / restore; "Archived items" panel per board (lists and cards).
- Board menu: filters, activity feed, labels, custom fields, archived items.

### Lists
- Create, rename, reorder (drag and drop), archive, move all cards, copy list.

### Cards
- Create quickly from the bottom of a list; reorder and move between lists by drag and drop.
- Card detail modal:
  - **Title** and **description** (Markdown with preview).
  - **Members** (assignees).
  - **Labels**: board-level, color + optional name; create/edit/delete.
  - **Dates**: start date, due date + time, "complete" checkbox; status badges (due soon / overdue / done).
  - **Checklists**: multiple per card, progress bar, reorder items, optional assignee and due date per item, hide checked items.
  - **Attachments**: upload files, add links, image previews, set an image as the cover.
  - **Cover**: color or image, normal or full-height style.
  - **Custom fields**: board-defined fields of type text, number, date, checkbox and dropdown (e.g. Priority, Story points); optionally shown on the card front.
  - **Comments**: add, edit, delete own comments, @mention board members.
  - **Activity log**: every change recorded ("Ali moved this card from To Do to Done").
  - **Actions**: move or copy to another list or **another board** (the user must have access to both), archive, delete, watch.
- Card front shows badges: labels, dates, checklist progress, comment count, attachment count, members, cover.

### Collaboration
- Real-time sync over WebSockets: card moves, edits and comments appear without a refresh.
- In-app notifications: assigned to a card, @mentioned, comment on a watched card, due date approaching.
- Board filters: keyword, labels, members, due date (overdue, due this week, no date), completed.

## 4. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React + TypeScript + Vite | Standard, fast, easy to hire for |
| UI | Tailwind CSS + Radix UI primitives | Trello-like look, accessible components, dark mode |
| Drag and drop | dnd-kit | Smooth list/card dragging, touch support |
| Data fetching | TanStack Query | Caching and optimistic updates when dragging |
| Backend | Node.js + TypeScript + Fastify | Same language as the frontend |
| Database | PostgreSQL + Prisma ORM | Relational data, migrations |
| Real-time | Socket.IO (one room per board) | Simple, reliable |
| Auth | Email/username + password (argon2 hashing), session in httpOnly cookie | No third-party login needed |
| File storage | Local disk in a Docker volume behind a storage interface | Can switch to S3 later without code changes elsewhere |
| Deployment | Docker Compose (web, api, postgres) + Caddy/Nginx with HTTPS | Runs on any VPS or company server |
| Tests | Vitest (unit), Playwright (end-to-end) | |

Repository layout (monorepo):

```
apps/
  web/        React frontend (board UI + /admin panel)
  api/        Fastify backend, Prisma schema, Socket.IO
packages/
  shared/     Shared TypeScript types and validation schemas (zod)
docker-compose.yml
```

## 5. Data model

```
User            id, username, email, fullName, avatarUrl, passwordHash,
                isSuperAdmin, isActive, createdAt
Board           id, title, background(type,value), archivedAt, createdById, createdAt
BoardMember     boardId, userId, role(ADMIN|MEMBER|OBSERVER), starred
List            id, boardId, title, position, archivedAt
Card            id, listId, boardId, title, description, position,
                startDate, dueDate, dueComplete, coverColor, coverAttachmentId,
                coverSize, archivedAt, createdById, createdAt
Label           id, boardId, name, color
CardLabel       cardId, labelId
CardMember      cardId, userId
CardWatcher     cardId, userId
Checklist       id, cardId, title, position
ChecklistItem   id, checklistId, text, checked, position, assigneeId, dueDate
Comment         id, cardId, authorId, body, createdAt, editedAt
Attachment      id, cardId, uploaderId, name, url | storageKey, mimeType, size, createdAt
CustomField     id, boardId, name, type(TEXT|NUMBER|DATE|CHECKBOX|DROPDOWN),
                position, showOnFront
CustomFieldOption id, fieldId, value, color, position
CardFieldValue  cardId, fieldId, text | number | date | checked | optionId
Activity        id, boardId, cardId?, actorId, type, data(json), createdAt
Notification    id, userId, activityId, readAt
Setting         key, value
```

Ordering of lists, cards, checklists and items uses fractional positions, so a
drag-and-drop only updates the moved item.

## 6. Screens

1. **Login**
2. **Boards home**: starred and all boards (Super Admin also sees a "Create board" button)
3. **Board view**: lists, cards, drag and drop, header with members, filter, and menu
4. **Card detail modal**
5. **Profile**: name, avatar, change own password
6. **Admin panel** (`/admin`, Super Admin only):
   - Users: list, create, edit, deactivate, reset password
   - Boards: all boards incl. archived, members and roles, restore/delete
   - Settings

## 7. Delivery phases

**Phase 1: core**
- Project setup, Docker Compose, database, CI
- Login, Super Admin panel (users, boards, passwords)
- Boards, board roles and access control, backgrounds, star
- Lists and cards with drag and drop, archive/restore
- Card details: description, labels, members, dates, checklists, comments

**Phase 2: complete card features**
- Attachments and covers
- Custom fields
- Move/copy cards across boards
- Activity log
- Real-time updates

**Phase 3: polish**
- Notifications, @mentions, watching
- Filters and search
- Dark mode, mobile layout polish
- Calendar view (optional)

## 8. Progress

- [x] Phase 1: login, Super Admin panel, boards and access control, lists, cards, drag and drop,
  labels, members, dates, description, checklists, comments, archive/restore, covers (colors)
- [x] From later phases: real-time updates, board filters
- [ ] Phase 2: attachments and image covers, custom fields, move/copy cards across boards, activity log
- [ ] Phase 3: notifications, @mentions, watching, dark mode, calendar view
