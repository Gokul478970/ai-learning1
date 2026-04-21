import { useState, useMemo, type DragEvent } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getProjectIssues, getBoards, getBoardSprints,
  createSprint, addIssuesToSprint, updateIssue, updateSprint, getProjectVersions,
  getAssignments,
} from '@/lib/api'
import { CreateIssueDialog } from '@/components/CreateIssueDialog'
import { ImportCsvDialog } from '@/components/ImportCsvDialog'
import { ExportCSVButton } from '@/components/ExportCSVButton'

import { isAdmin, isDemo, getEmail } from '@/lib/auth'
import { STATUS_COLORS, ISSUE_TYPE_ICONS, PRIORITY_CONFIG, getInitials } from '@/lib/utils'
import { Loader2, Plus, ChevronDown, ChevronRight, Play, Square, Settings, Calendar, BarChart3, FileUp, Filter, ChevronLeft } from 'lucide-react'

const PAGE_SIZE = 50

const sortByKey = (a: any, b: any) => {
  const numA = parseInt(a.key.split('-')[1]) || 0
  const numB = parseInt(b.key.split('-')[1]) || 0
  return numA - numB
}

export function Backlog() {
  const { projectKey } = useParams<{ projectKey: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const epicFilter = searchParams.get('epic')
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [expandedSprints, setExpandedSprints] = useState<Set<string>>(new Set(['backlog']))
  const [newSprintName, setNewSprintName] = useState('')
  const [selectedIssues, setSelectedIssues] = useState<Set<string>>(new Set())
  const [moveToSprint, setMoveToSprint] = useState('')
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null)
  const [editingSprint, setEditingSprint] = useState<string | null>(null)
  const [sprintForm, setSprintForm] = useState({ name: '', goal: '', startDate: '', endDate: '' })
  const [showProgress, setShowProgress] = useState(false)
  const [backlogPage, setBacklogPage] = useState(0)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [assigneeFilter, setAssigneeFilter] = useState<string>('')
  const [priorityFilter, setPriorityFilter] = useState<string>('')
  const [issueTypeFilter, setIssueTypeFilter] = useState<string>('')
  const [sprintFilter, setSprintFilter] = useState<string>('')
  const readOnly = isDemo()

  const { data: boards } = useQuery({
    queryKey: ['boards', projectKey],
    queryFn: () => getBoards(projectKey),
    enabled: !!projectKey,
  })
  const boardId = boards?.[0]?.id

  const { data: sprints } = useQuery({
    queryKey: ['sprints', boardId],
    queryFn: () => getBoardSprints(boardId!),
    enabled: !!boardId,
  })

  const { data: allData, isLoading } = useQuery({
    queryKey: ['projectIssues', projectKey, 'backlog'],
    queryFn: () => getProjectIssues(projectKey!, { limit: '5000' }),
    enabled: !!projectKey,
  })

  const { data: versions } = useQuery({
    queryKey: ['versions', projectKey],
    queryFn: () => getProjectVersions(projectKey!),
    enabled: !!projectKey && showProgress,
  })

  const { data: assignments } = useQuery({
    queryKey: ['assignments', projectKey],
    queryFn: () => getAssignments(projectKey!),
    enabled: !!projectKey,
  })
  const currentEmail = getEmail()
  const canManageSprints = isAdmin() || (assignments || []).some(
    (a: any) => a.email === currentEmail && a.role === 'Project Admin' && !a.end_date
  )

  const issues = allData?.items || []

  const filteredIssues = useMemo(() => {
    return issues.filter((i: any) => {
      if (epicFilter && i.epic !== epicFilter) return false
      if (statusFilter && i.status !== statusFilter) return false
      if (assigneeFilter && i.assignee !== assigneeFilter) return false
      if (priorityFilter && i.priority !== priorityFilter) return false
      if (issueTypeFilter && i.issue_type !== issueTypeFilter) return false
      if (sprintFilter && i.sprint !== sprintFilter) return false
      return true
    })
  }, [issues, epicFilter, statusFilter, assigneeFilter, priorityFilter, issueTypeFilter, sprintFilter])

  const exportFilters = useMemo(() => {
    const f: Record<string, string> = {}
    if (statusFilter) f.status = statusFilter
    if (assigneeFilter) f.assignee = assigneeFilter
    if (priorityFilter) f.priority = priorityFilter
    if (issueTypeFilter) f.issue_type = issueTypeFilter
    if (sprintFilter) f.sprint = sprintFilter
    if (epicFilter) f.epic = epicFilter
    return f
  }, [statusFilter, assigneeFilter, priorityFilter, issueTypeFilter, sprintFilter, epicFilter])

  const toggleSprint = (id: string) => {
    setExpandedSprints((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleCreateSprint = async () => {
    if (!boardId || !newSprintName.trim()) return
    await createSprint(boardId, { name: newSprintName.trim() })
    setNewSprintName('')
    qc.invalidateQueries({ queryKey: ['sprints', boardId] })
  }

  const moveIssuesMutation = useMutation({
    mutationFn: async ({ sprintId, keys }: { sprintId: string; keys: string[] }) => {
      if (sprintId === 'backlog') {
        await Promise.all(keys.map((k) => updateIssue(k, { sprint: null })))
      } else {
        await addIssuesToSprint(sprintId, keys)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projectIssues', projectKey, 'backlog'] })
      setSelectedIssues(new Set())
      setMoveToSprint('')
    },
  })

  const handleDrop = (e: DragEvent, targetSprintId: string) => {
    e.preventDefault()
    setDragOverTarget(null)
    const key = e.dataTransfer.getData('text/plain')
    if (key) {
      moveIssuesMutation.mutate({ sprintId: targetSprintId, keys: [key] })
    }
  }

  const handleSaveSprint = async (id: string) => {
    await updateSprint(id, {
      name: sprintForm.name,
      goal: sprintForm.goal,
      start_date: sprintForm.startDate || null,
      end_date: sprintForm.endDate || null,
    })
    setEditingSprint(null)
    qc.invalidateQueries({ queryKey: ['sprints', boardId] })
  }

  if (!projectKey) return <div className="p-6">No project selected</div>
  if (isLoading) {
    return (
      <div className="p-6 flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading backlog…
      </div>
    )
  }

  const backlogIssues = filteredIssues.filter((i: any) => !i.sprint).sort(sortByKey)
  const pagedBacklog = backlogIssues.slice(backlogPage * PAGE_SIZE, (backlogPage + 1) * PAGE_SIZE)

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">Backlog</h1>
          <Link to={`/projects/${projectKey}`} className="text-sm text-blue-600 hover:underline">
            ← Project
          </Link>
        </div>
        <div className="flex items-center gap-2">
          {!readOnly && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" /> Create Issue
            </button>
          )}
          {!readOnly && (
            <button
              type="button"
              onClick={() => setShowImport(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <FileUp className="w-4 h-4" /> Import CSV
            </button>
          )}
          <ExportCSVButton
            projectKey={projectKey}
            filters={exportFilters}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            type="button"
            onClick={() => setShowProgress((s) => !s)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <BarChart3 className="w-4 h-4" /> Progress
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center text-sm">
        <Filter className="w-4 h-4 text-gray-500" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border rounded px-2 py-1">
          <option value="">All statuses</option>
          {Object.keys(STATUS_COLORS || {}).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)} className="border rounded px-2 py-1">
          <option value="">All assignees</option>
          {(assignments || []).map((a: any) => (
            <option key={a.email} value={a.email}>{a.email}</option>
          ))}
        </select>
        <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="border rounded px-2 py-1">
          <option value="">All priorities</option>
          {Object.keys(PRIORITY_CONFIG || {}).map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select value={issueTypeFilter} onChange={(e) => setIssueTypeFilter(e.target.value)} className="border rounded px-2 py-1">
          <option value="">All types</option>
          {Object.keys(ISSUE_TYPE_ICONS || {}).map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select value={sprintFilter} onChange={(e) => setSprintFilter(e.target.value)} className="border rounded px-2 py-1">
          <option value="">All sprints</option>
          {(sprints || []).map((s: any) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {showProgress && versions && (
        <div className="p-3 border rounded bg-gray-50 text-sm">
          <div className="font-semibold mb-2">Versions</div>
          <ul className="space-y-1">
            {versions.map((v: any) => (
              <li key={v.id} className="flex items-center gap-2">
                <Calendar className="w-3 h-3" /> {v.name}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(sprints || []).map((sprint: any) => {
        const sprintIssues = filteredIssues.filter((i: any) => i.sprint === sprint.id).sort(sortByKey)
        const isOpen = expandedSprints.has(sprint.id)
        return (
          <div
            key={sprint.id}
            className={`border rounded ${dragOverTarget === sprint.id ? 'bg-blue-50' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOverTarget(sprint.id) }}
            onDragLeave={() => setDragOverTarget(null)}
            onDrop={(e) => handleDrop(e, sprint.id)}
          >
            <div className="flex items-center justify-between p-2">
              <button type="button" onClick={() => toggleSprint(sprint.id)} className="flex items-center gap-2">
                {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                <span className="font-semibold">{sprint.name}</span>
                <span className="text-xs text-gray-500">({sprintIssues.length})</span>
              </button>
              {canManageSprints && editingSprint !== sprint.id && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingSprint(sprint.id)
                    setSprintForm({
                      name: sprint.name || '',
                      goal: sprint.goal || '',
                      startDate: sprint.start_date || '',
                      endDate: sprint.end_date || '',
                    })
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <Settings className="w-4 h-4" />
                </button>
              )}
            </div>
            {editingSprint === sprint.id && (
              <div className="p-2 border-t space-y-2 text-sm">
                <input value={sprintForm.name} onChange={(e) => setSprintForm({ ...sprintForm, name: e.target.value })} className="border rounded px-2 py-1 w-full" placeholder="Name" />
                <input value={sprintForm.goal} onChange={(e) => setSprintForm({ ...sprintForm, goal: e.target.value })} className="border rounded px-2 py-1 w-full" placeholder="Goal" />
                <div className="flex gap-2">
                  <input type="date" value={sprintForm.startDate} onChange={(e) => setSprintForm({ ...sprintForm, startDate: e.target.value })} className="border rounded px-2 py-1" />
                  <input type="date" value={sprintForm.endDate} onChange={(e) => setSprintForm({ ...sprintForm, endDate: e.target.value })} className="border rounded px-2 py-1" />
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => handleSaveSprint(sprint.id)} className="px-2 py-1 bg-blue-600 text-white rounded">Save</button>
                  <button type="button" onClick={() => setEditingSprint(null)} className="px-2 py-1 border rounded">Cancel</button>
                </div>
              </div>
            )}
            {isOpen && (
              <ul className="divide-y">
                {sprintIssues.map((iss: any) => (
                  <li
                    key={iss.key}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', iss.key)}
                    className="p-2 flex items-center gap-2 hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIssues.has(iss.key)}
                      onChange={(e) => {
                        const next = new Set(selectedIssues)
                        if (e.target.checked) next.add(iss.key)
                        else next.delete(iss.key)
                        setSelectedIssues(next)
                      }}
                    />
                    <Link to={`/issues/${iss.key}`} className="text-blue-600 hover:underline">{iss.key}</Link>
                    <span className="flex-1 truncate">{iss.summary}</span>
                    <span className="text-xs text-gray-500">{iss.status}</span>
                    {iss.assignee && (
                      <span className="text-xs bg-gray-200 rounded-full px-2 py-0.5">{getInitials(iss.assignee)}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}

      <div
        className={`border rounded ${dragOverTarget === 'backlog' ? 'bg-blue-50' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOverTarget('backlog') }}
        onDragLeave={() => setDragOverTarget(null)}
        onDrop={(e) => handleDrop(e, 'backlog')}
      >
        <div className="flex items-center justify-between p-2">
          <button type="button" onClick={() => toggleSprint('backlog')} className="flex items-center gap-2">
            {expandedSprints.has('backlog') ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <span className="font-semibold">Backlog</span>
            <span className="text-xs text-gray-500">({backlogIssues.length})</span>
          </button>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setBacklogPage((p) => Math.max(0, p - 1))} disabled={backlogPage === 0} className="p-1 disabled:opacity-50">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs">Page {backlogPage + 1}</span>
            <button type="button" onClick={() => setBacklogPage((p) => (p + 1) * PAGE_SIZE < backlogIssues.length ? p + 1 : p)} className="p-1">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        {expandedSprints.has('backlog') && (
          <ul className="divide-y">
            {pagedBacklog.map((iss: any) => (
              <li
                key={iss.key}
                draggable
                onDragStart={(e) => e.dataTransfer.setData('text/plain', iss.key)}
                className="p-2 flex items-center gap-2 hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={selectedIssues.has(iss.key)}
                  onChange={(e) => {
                    const next = new Set(selectedIssues)
                    if (e.target.checked) next.add(iss.key)
                    else next.delete(iss.key)
                    setSelectedIssues(next)
                  }}
                />
                <Link to={`/issues/${iss.key}`} className="text-blue-600 hover:underline">{iss.key}</Link>
                <span className="flex-1 truncate">{iss.summary}</span>
                <span className="text-xs text-gray-500">{iss.status}</span>
                {iss.assignee && (
                  <span className="text-xs bg-gray-200 rounded-full px-2 py-0.5">{getInitials(iss.assignee)}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {canManageSprints && (
        <div className="flex gap-2 items-center">
          <input
            value={newSprintName}
            onChange={(e) => setNewSprintName(e.target.value)}
            placeholder="New sprint name"
            className="border rounded px-2 py-1 text-sm"
          />
          <button type="button" onClick={handleCreateSprint} className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded">
            <Play className="w-3 h-3" /> Create Sprint
          </button>
        </div>
      )}

      {selectedIssues.size > 0 && (
        <div className="fixed bottom-4 right-4 bg-white border shadow-lg rounded p-3 flex items-center gap-2">
          <span className="text-sm">{selectedIssues.size} selected</span>
          <select value={moveToSprint} onChange={(e) => setMoveToSprint(e.target.value)} className="border rounded px-2 py-1 text-sm">
            <option value="">Move to…</option>
            <option value="backlog">Backlog</option>
            {(sprints || []).map((s: any) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => moveToSprint && moveIssuesMutation.mutate({ sprintId: moveToSprint, keys: Array.from(selectedIssues) })}
            className="px-2 py-1 bg-blue-600 text-white text-sm rounded"
          >
            Move
          </button>
          <button type="button" onClick={() => setSelectedIssues(new Set())} className="px-2 py-1 border text-sm rounded">
            <Square className="w-3 h-3" />
          </button>
        </div>
      )}

      {showCreate && (
        <CreateIssueDialog
          projectKey={projectKey}
          onClose={() => setShowCreate(false)}
          onCreated={() => qc.invalidateQueries({ queryKey: ['projectIssues', projectKey, 'backlog'] })}
        />
      )}
      {showImport && (
        <ImportCsvDialog
          projectKey={projectKey}
          onClose={() => setShowImport(false)}
          onImported={() => qc.invalidateQueries({ queryKey: ['projectIssues', projectKey, 'backlog'] })}
        />
      )}
    </div>
  )
}

export default Backlog
