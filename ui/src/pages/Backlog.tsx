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
  const [exportError, setExportError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [assigneeFilter, setAssigneeFilter] = useState<string>('')
  const [priorityFilter, setPriorityFilter] = useState<string>('')
  const [issueTypeFilter, setIssueTypeFilter] = useState<string>('')
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

  // Stable filter object for ExportCSVButton to avoid unnecessary re-renders
  const exportFilters = useMemo(
    () => ({
      status: statusFilter || undefined,
      assignee: assigneeFilter || undefined,
      priority: priorityFilter || undefined,
      issue_type: issueTypeFilter || undefined,
      epic: epicFilter || undefined,
    }),
    [statusFilter, assigneeFilter, priorityFilter, issueTypeFilter, epicFilter]
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  const allIssues: any[] = (allData?.issues || []).slice().sort(sortByKey)

  // Apply client-side filters
  const filteredIssues = allIssues.filter((issue) => {
    if (statusFilter && issue.status !== statusFilter) return false
    if (assigneeFilter && issue.assignee !== assigneeFilter) return false
    if (priorityFilter && issue.priority !== priorityFilter) return false
    if (issueTypeFilter && issue.issue_type !== issueTypeFilter) return false
    if (epicFilter && issue.epic_link !== epicFilter) return false
    return true
  })

  const activeSprints = (sprints || []).filter((s: any) => s.state === 'active')
  const futureSprints = (sprints || []).filter((s: any) => s.state === 'future')
  const sprintIssues = (sprintId: string) =>
    filteredIssues.filter((i: any) => i.sprint_id === sprintId)
  const backlogIssues = filteredIssues.filter((i: any) => !i.sprint_id)
  const pagedBacklog = backlogIssues.slice(
    backlogPage * PAGE_SIZE,
    (backlogPage + 1) * PAGE_SIZE
  )

  const toggleSprint = (id: string) => {
    const next = new Set(expandedSprints)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setExpandedSprints(next)
  }

  const createSprintMut = useMutation({
    mutationFn: (name: string) => createSprint(boardId!, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sprints', boardId] })
      setNewSprintName('')
    },
  })

  const moveMut = useMutation({
    mutationFn: ({ sprintId, keys }: { sprintId: string; keys: string[] }) =>
      addIssuesToSprint(sprintId, keys),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projectIssues', projectKey, 'backlog'] })
      setSelectedIssues(new Set())
      setMoveToSprint('')
    },
  })

  const updateIssueMut = useMutation({
    mutationFn: ({ key, patch }: { key: string; patch: any }) => updateIssue(key, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projectIssues', projectKey, 'backlog'] })
    },
  })

  const updateSprintMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: any }) => updateSprint(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sprints', boardId] })
      setEditingSprint(null)
    },
  })

  const handleDragStart = (e: DragEvent<HTMLDivElement>, issueKey: string) => {
    e.dataTransfer.setData('text/plain', issueKey)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>, target: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverTarget(target)
  }

  const handleDragLeave = () => setDragOverTarget(null)

  const handleDrop = (e: DragEvent<HTMLDivElement>, target: string) => {
    e.preventDefault()
    setDragOverTarget(null)
    const issueKey = e.dataTransfer.getData('text/plain')
    if (!issueKey) return
    if (target === 'backlog') {
      updateIssueMut.mutate({ key: issueKey, patch: { sprint_id: null } })
    } else {
      moveMut.mutate({ sprintId: target, keys: [issueKey] })
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Backlog</h1>
          <p className="text-sm text-gray-500">
            <Link to={`/projects/${projectKey}`} className="hover:underline">
              {projectKey}
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!readOnly && canManageSprints && (
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" /> Create Issue
            </button>
          )}
          {!readOnly && canManageSprints && (
            <button
              onClick={() => setShowImport(true)}
              className="inline-flex items-center gap-2 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <FileUp className="h-4 w-4" /> Import CSV
            </button>
          )}
          <ExportCSVButton
            projectKey={projectKey}
            filters={exportFilters}
            onError={(msg) => setExportError(msg)}
          />
          <button
            onClick={() => setShowProgress((v) => !v)}
            className="inline-flex items-center gap-2 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <BarChart3 className="h-4 w-4" /> Progress
          </button>
        </div>
      </div>

      {exportError && (
        <div
          role="alert"
          className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 flex items-center justify-between"
        >
          <span>Export failed: {exportError}</span>
          <button
            onClick={() => setExportError(null)}
            className="text-red-700 hover:text-red-900 font-medium"
            aria-label="Dismiss export error"
          >
            ×
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap text-sm">
        <Filter className="h-4 w-4 text-gray-400" />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1"
        >
          <option value="">All statuses</option>
          {Object.keys(STATUS_COLORS || {}).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1"
        >
          <option value="">All priorities</option>
          {Object.keys(PRIORITY_CONFIG || {}).map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select
          value={issueTypeFilter}
          onChange={(e) => setIssueTypeFilter(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1"
        >
          <option value="">All types</option>
          {Object.keys(ISSUE_TYPE_ICONS || {}).map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <input
          type="text"
          value={assigneeFilter}
          onChange={(e) => setAssigneeFilter(e.target.value)}
          placeholder="Assignee"
          className="rounded border border-gray-300 px-2 py-1"
        />
        {epicFilter && (
          <button
            onClick={() => {
              const next = new URLSearchParams(searchParams)
              next.delete('epic')
              setSearchParams(next)
            }}
            className="inline-flex items-center gap-1 rounded bg-purple-100 px-2 py-1 text-purple-700 hover:bg-purple-200"
          >
            Epic: {epicFilter} ×
          </button>
        )}
      </div>

      {/* Active Sprints */}
      {activeSprints.map((sprint: any) => (
        <div
          key={sprint.id}
          onDragOver={(e) => handleDragOver(e, sprint.id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, sprint.id)}
          className={`rounded border ${dragOverTarget === sprint.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}
        >
          <div className="flex items-center justify-between px-3 py-2 bg-gray-50">
            <button
              onClick={() => toggleSprint(sprint.id)}
              className="flex items-center gap-2 font-medium"
            >
              {expandedSprints.has(sprint.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <Play className="h-4 w-4 text-green-600" />
              {sprint.name}
              <span className="text-sm text-gray-500">({sprintIssues(sprint.id).length})</span>
            </button>
          </div>
          {expandedSprints.has(sprint.id) && (
            <div className="divide-y divide-gray-100">
              {sprintIssues(sprint.id).map((issue: any) => (
                <div
                  key={issue.key}
                  draggable={!readOnly}
                  onDragStart={(e) => handleDragStart(e, issue.key)}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50"
                >
                  <Link to={`/issues/${issue.key}`} className="font-mono text-sm text-blue-600 hover:underline">
                    {issue.key}
                  </Link>
                  <span className="flex-1 text-sm">{issue.summary}</span>
                  <span className="text-xs text-gray-500">{issue.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Future Sprints */}
      {futureSprints.map((sprint: any) => (
        <div
          key={sprint.id}
          onDragOver={(e) => handleDragOver(e, sprint.id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, sprint.id)}
          className={`rounded border ${dragOverTarget === sprint.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}
        >
          <div className="flex items-center justify-between px-3 py-2 bg-gray-50">
            <button
              onClick={() => toggleSprint(sprint.id)}
              className="flex items-center gap-2 font-medium"
            >
              {expandedSprints.has(sprint.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <Calendar className="h-4 w-4 text-gray-500" />
              {sprint.name}
              <span className="text-sm text-gray-500">({sprintIssues(sprint.id).length})</span>
            </button>
          </div>
          {expandedSprints.has(sprint.id) && (
            <div className="divide-y divide-gray-100">
              {sprintIssues(sprint.id).map((issue: any) => (
                <div
                  key={issue.key}
                  draggable={!readOnly}
                  onDragStart={(e) => handleDragStart(e, issue.key)}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50"
                >
                  <Link to={`/issues/${issue.key}`} className="font-mono text-sm text-blue-600 hover:underline">
                    {issue.key}
                  </Link>
                  <span className="flex-1 text-sm">{issue.summary}</span>
                  <span className="text-xs text-gray-500">{issue.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Backlog */}
      <div
        onDragOver={(e) => handleDragOver(e, 'backlog')}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, 'backlog')}
        className={`rounded border ${dragOverTarget === 'backlog' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}
      >
        <div className="flex items-center justify-between px-3 py-2 bg-gray-50">
          <button
            onClick={() => toggleSprint('backlog')}
            className="flex items-center gap-2 font-medium"
          >
            {expandedSprints.has('backlog') ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <Square className="h-4 w-4 text-gray-500" />
            Backlog
            <span className="text-sm text-gray-500">({backlogIssues.length})</span>
          </button>
          {backlogIssues.length > PAGE_SIZE && (
            <div className="flex items-center gap-2 text-sm">
              <button
                onClick={() => setBacklogPage((p) => Math.max(0, p - 1))}
                disabled={backlogPage === 0}
                className="p-1 disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span>
                {backlogPage * PAGE_SIZE + 1}-{Math.min((backlogPage + 1) * PAGE_SIZE, backlogIssues.length)} of {backlogIssues.length}
              </span>
              <button
                onClick={() => setBacklogPage((p) => ((p + 1) * PAGE_SIZE < backlogIssues.length ? p + 1 : p))}
                disabled={(backlogPage + 1) * PAGE_SIZE >= backlogIssues.length}
                className="p-1 disabled:opacity-50"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
        {expandedSprints.has('backlog') && (
          <div className="divide-y divide-gray-100">
            {pagedBacklog.map((issue: any) => (
              <div
                key={issue.key}
                draggable={!readOnly}
                onDragStart={(e) => handleDragStart(e, issue.key)}
                className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50"
              >
                <Link to={`/issues/${issue.key}`} className="font-mono text-sm text-blue-600 hover:underline">
                  {issue.key}
                </Link>
                <span className="flex-1 text-sm">{issue.summary}</span>
                <span className="text-xs text-gray-500">{issue.status}</span>
                {issue.assignee && (
                  <span className="text-xs bg-gray-200 rounded-full h-6 w-6 flex items-center justify-center">
                    {getInitials(issue.assignee)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateIssueDialog
          projectKey={projectKey!}
          onClose={() => setShowCreate(false)}
          onCreated={() => qc.invalidateQueries({ queryKey: ['projectIssues', projectKey, 'backlog'] })}
        />
      )}
      {showImport && (
        <ImportCsvDialog
          projectKey={projectKey!}
          onClose={() => setShowImport(false)}
          onImported={() => qc.invalidateQueries({ queryKey: ['projectIssues', projectKey, 'backlog'] })}
        />
      )}
    </div>
  )
}

export default Backlog
