import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type BoardTile } from '../api';
import { Topbar } from '../components/Topbar';
import { Button, cx, ErrorText, Icon, Spinner } from '../components/ui';

export function BoardsPage() {
  const qc = useQueryClient();
  const boards = useQuery({ queryKey: ['boards'], queryFn: () => api.get<{ boards: BoardTile[] }>('/boards') });
  const archived = useQuery({
    queryKey: ['boards', 'archived'],
    queryFn: () => api.get<{ boards: (BoardTile & { archivedAt: string })[] }>('/boards/archived'),
  });

  const star = useMutation({
    mutationFn: (b: BoardTile) => api.put(`/boards/${b.id}/star`, { starred: !b.starred }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['boards'] }),
  });
  const reopen = useMutation({
    mutationFn: (id: string) => api.patch(`/boards/${id}`, { archived: false }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['boards'] }),
  });

  const list = boards.data?.boards ?? [];
  const starred = list.filter((b) => b.starred);

  const tile = (b: BoardTile) => (
    <Link
      key={b.id}
      to={`/b/${b.id}`}
      className="group relative flex h-24 flex-col justify-between rounded-lg p-2.5 text-white shadow-sm hover:brightness-95"
      style={{ background: b.background }}
    >
      <span className="line-clamp-2 font-bold drop-shadow">{b.title}</span>
      <button
        type="button"
        aria-label={b.starred ? 'Unstar board' : 'Star board'}
        onClick={(e) => {
          e.preventDefault();
          star.mutate(b);
        }}
        className={cx(
          'self-end rounded p-0.5 transition-opacity hover:scale-110',
          b.starred ? 'text-[#f5cd47] opacity-100' : 'opacity-0 group-hover:opacity-100',
        )}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill={b.starred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
          <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z" />
        </svg>
      </button>
    </Link>
  );

  return (
    <div className="flex min-h-full flex-col">
      <Topbar />
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        {boards.isLoading ? (
          <Spinner />
        ) : (
          <>
            <ErrorText error={boards.error} />
            {starred.length > 0 && (
              <section className="mb-8">
                <h2 className="mb-3 flex items-center gap-2 font-semibold text-[#44546f]">
                  <Icon name="star" /> Starred boards
                </h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{starred.map(tile)}</div>
              </section>
            )}
            <section>
              <h2 className="mb-3 flex items-center gap-2 font-semibold text-[#44546f]">
                <Icon name="card" /> Your boards
              </h2>
              {list.length === 0 ? (
                <p className="rounded-lg bg-white p-6 text-center text-sm text-[#626f86] shadow-sm">
                  You haven't been added to any boards yet. Ask your administrator for access.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{list.map(tile)}</div>
              )}
            </section>
            {(archived.data?.boards.length ?? 0) > 0 && (
              <section className="mt-10">
                <h2 className="mb-3 flex items-center gap-2 font-semibold text-[#44546f]">
                  <Icon name="archive" /> Closed boards
                </h2>
                <ul className="divide-y rounded-lg bg-white shadow-sm">
                  {archived.data!.boards.map((b) => (
                    <li key={b.id} className="flex items-center gap-3 p-3">
                      <span className="h-8 w-10 rounded" style={{ background: b.background }} />
                      <span className="flex-1 font-medium">{b.title}</span>
                      <Button onClick={() => reopen.mutate(b.id)} disabled={reopen.isPending}>
                        <Icon name="undo" /> Reopen
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
