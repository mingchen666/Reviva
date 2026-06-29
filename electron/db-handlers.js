// electron/db-handlers.js — Thin IPC bridge delegating to DatabaseService
import { ipcMain } from 'electron'

export function registerDbHandlers(db, services = {}) {
  const notes = services.notes || db
  const noteFolders = services.noteFolders || db
  // ─── Spaces ───
  ipcMain.handle('db:spaces:list', () => db.listSpaces())
  ipcMain.handle('db:spaces:get', (_, id) => db.getSpace(id))
  ipcMain.handle('db:spaces:create', (_, data) => db.createSpace(data))
  ipcMain.handle('db:spaces:update', (_, id, data) => db.updateSpace(id, data))
  ipcMain.handle('db:spaces:delete', (_, id) => db.deleteSpace(id))
  ipcMain.handle('db:spaces:docCount', (_, id) => db.spaceDocCount(id))

  // ─── Documents ───
  ipcMain.handle('db:docs:list', (_, spaceId) => db.listDocs(spaceId))
  ipcMain.handle('db:docs:create', (_, data) => db.createDoc(data))
  ipcMain.handle('db:docs:update', (_, id, data) => db.updateDoc(id, data))
  ipcMain.handle('db:docs:delete', (_, id) => db.deleteDoc(id))

  // ─── Conversations ───
  ipcMain.handle('db:convs:list', (_, spaceId, groupId) => db.listConvs(spaceId, groupId))
  ipcMain.handle('db:convs:get', (_, id) => db.getConv(id))
  ipcMain.handle('db:convs:create', (_, data) => db.createConv(data))
  ipcMain.handle('db:convs:update', (_, id, data) => db.updateConv(id, data))
  ipcMain.handle('db:convs:delete', (_, id) => db.deleteConv(id))

  // ─── Conversation Groups ───
  ipcMain.handle('db:convGroups:list', () => db.listConvGroups())
  ipcMain.handle('db:convGroups:create', (_, data) => db.createConvGroup(data))
  ipcMain.handle('db:convGroups:update', (_, id, data) => db.updateConvGroup(id, data))
  ipcMain.handle('db:convGroups:delete', (_, id) => db.deleteConvGroup(id))

  // ─── Messages ───
  ipcMain.handle('db:msgs:list', (_, convId) => db.listMsgs(convId))
  ipcMain.handle('db:msgs:listPaginated', (_, convId, limit, offset) => db.listMsgsPaginated(convId, limit, offset))
  ipcMain.handle('db:msgs:count', (_, convId) => db.countMsgs(convId))
  ipcMain.handle('db:msgs:create', (_, data) => db.createMsg(data))
  ipcMain.handle('db:msgs:update', (_, id, data) => db.updateMsg(id, data))
  ipcMain.handle('db:msgs:delete', (_, id) => db.deleteMsg(id))

  // ─── Agents ───
  ipcMain.handle('db:agents:list', () => db.listAgents())
  ipcMain.handle('db:agents:get', (_, id) => db.getAgent(id))
  ipcMain.handle('db:agents:create', (_, data) => db.createAgent(data))
  ipcMain.handle('db:agents:update', (_, id, data) => db.updateAgent(id, data))
  ipcMain.handle('db:agents:delete', (_, id) => db.deleteAgent(id))
  ipcMain.handle('db:agents:isEnglishNameUnique', (_, englishName, excludeId) => db.isEnglishNameUnique(englishName, excludeId))

  // ─── Skills ───
  ipcMain.handle('db:skills:list', () => db.listSkills())
  ipcMain.handle('db:skills:create', (_, data) => db.createSkill(data))
  ipcMain.handle('db:skills:update', (_, id, data) => db.updateSkill(id, data))
  ipcMain.handle('db:skills:delete', (_, id) => db.deleteSkill(id))

  // ─── Tools ───
  ipcMain.handle('db:tools:list', () => db.listTools())
  ipcMain.handle('db:tools:create', (_, data) => db.createTool(data))
  ipcMain.handle('db:tools:update', (_, id, data) => db.updateTool(id, data))
  ipcMain.handle('db:tools:delete', (_, id) => db.deleteTool(id))

  // ─── MCP Servers ───
  ipcMain.handle('db:mcpServers:list', () => db.listMcpServers())
  ipcMain.handle('db:mcpServers:get', (_, id) => db.getMcpServer(id))
  ipcMain.handle('db:mcpServers:create', (_, data) => db.createMcpServer(data))
  ipcMain.handle('db:mcpServers:update', (_, id, data) => db.updateMcpServer(id, data))
  ipcMain.handle('db:mcpServers:delete', (_, id) => db.deleteMcpServer(id))

  // ─── Sub Agents ───
  ipcMain.handle('db:subAgents:list', () => db.listSubAgents())
  ipcMain.handle('db:subAgents:create', (_, data) => db.createSubAgent(data))
  ipcMain.handle('db:subAgents:update', (_, id, data) => db.updateSubAgent(id, data))
  ipcMain.handle('db:subAgents:delete', (_, id) => db.deleteSubAgent(id))

  // ─── Tasks ───
  ipcMain.handle('db:tasks:list', () => db.listTasks())
  ipcMain.handle('db:tasks:listByGroup', (_, groupId, toolIds) => db.listTasksByGroup(groupId, toolIds))
  ipcMain.handle('db:tasks:get', (_, id) => db.getTask(id))
  ipcMain.handle('db:tasks:create', (_, data) => db.createTask(data))
  ipcMain.handle('db:tasks:update', (_, id, data) => db.updateTask(id, data))
  ipcMain.handle('db:tasks:delete', (_, id) => db.deleteTask(id))

  // ─── Outputs ───
  ipcMain.handle('db:outputs:list', () => db.listOutputs())
  ipcMain.handle('db:outputs:create', (_, data) => db.createOutput(data))
  ipcMain.handle('db:outputs:delete', (_, id) => db.deleteOutput(id))

  // ─── Artifacts ───
  ipcMain.handle('db:artifacts:listByGroup', (_, groupId) => db.listArtifactsByGroup(groupId))
  ipcMain.handle('db:artifacts:create', (_, data) => db.createArtifact(data))
  ipcMain.handle('db:artifacts:delete', (_, id) => db.deleteArtifact(id))
  ipcMain.handle('db:artifacts:update', (_, id, data) => db.updateArtifact(id, data))

  // ─── Settings ───
  ipcMain.handle('db:settings:get', (_, key) => db.getSetting(key))
  ipcMain.handle('db:settings:set', (_, key, value) => db.setSetting(key, value))
  ipcMain.handle('db:settings:getAll', () => db.getAllSettings())

  // ─── Memories ───
  ipcMain.handle('db:memories:list', () => db.listMemories())
  ipcMain.handle('db:memories:create', (_, data) => db.createMemory(data))
  ipcMain.handle('db:memories:update', (_, id, data) => db.updateMemory(id, data))
  ipcMain.handle('db:memories:delete', (_, id) => db.deleteMemory(id))

  // ─── Recycle Bin ───
  ipcMain.handle('db:trash:list', () => db.listTrash())
  ipcMain.handle('db:trash:listByCategory', (_, category) => db.listTrashByCategory(category))
  ipcMain.handle('db:trash:get', (_, id) => db.getTrashItem(id))
  ipcMain.handle('db:trash:create', (_, data) => db.createTrashItem(data))
  ipcMain.handle('db:trash:delete', (_, id) => db.deleteTrashItem(id))
  ipcMain.handle('db:trash:deleteBatch', (_, ids) => db.deleteTrashItems(ids))
  ipcMain.handle('db:trash:empty', () => db.emptyTrash())
  ipcMain.handle('db:trash:count', () => db.trashItemCount())

  // ─── Token Usage ───
  ipcMain.handle('db:tokenUsage:create', (_, data) => db.createTokenUsage(data))
  ipcMain.handle('db:tokenUsage:list', (_, filters) => db.listTokenUsage(filters))
  ipcMain.handle('db:tokenUsage:summary', (_, range) => db.getTokenUsageSummary(range))
  ipcMain.handle('db:tokenUsage:byModel', (_, range) => db.getTokenUsageByModel(range))
  ipcMain.handle('db:tokenUsage:byAgent', (_, range) => db.getTokenUsageByAgent(range))
  ipcMain.handle('db:tokenUsage:daily', (_, range) => db.getTokenUsageDaily(range))
  ipcMain.handle('db:tokenUsage:cleanup', (_, beforeDate) => db.deleteOldTokenUsage(beforeDate))

  // ─── Agent Runs ───
  ipcMain.handle('db:agentRuns:create', (_, data) => db.createAgentRun(data))
  ipcMain.handle('db:agentRuns:get', (_, id) => db.getAgentRun(id))
  ipcMain.handle('db:agentRuns:update', (_, id, data) => db.updateAgentRun(id, data))
  ipcMain.handle('db:agentRuns:listByConv', (_, convId) => db.listAgentRunsByConversation(convId))
  ipcMain.handle('db:agentRuns:listByAgent', (_, agentId) => db.listAgentRunsByAgent(agentId))
  ipcMain.handle('db:agentRuns:delete', (_, id) => db.deleteAgentRun(id))

  // ─── Note Folders ───
  ipcMain.handle('db:noteFolders:list', (_, parentId) => db.listNoteFolders(parentId))
  ipcMain.handle('db:noteFolders:get', (_, id) => db.getNoteFolder(id))
  ipcMain.handle('db:noteFolders:create', (_, data) => noteFolders.createNoteFolder(data))
  ipcMain.handle('db:noteFolders:update', (_, id, data) => noteFolders.updateNoteFolder(id, data))
  ipcMain.handle('db:noteFolders:delete', (_, id) => noteFolders.deleteNoteFolder(id))

  // ─── Notes ───
  ipcMain.handle('db:notes:list', (_, folderId) => notes.listNotes(folderId))
  ipcMain.handle('db:notes:get', (_, id) => notes.getNote(id))
  ipcMain.handle('db:notes:create', (_, data) => notes.createNote(data))
  ipcMain.handle('db:notes:update', (_, id, data) => notes.updateNote(id, data))
  ipcMain.handle('db:notes:delete', (_, id) => notes.deleteNote(id))
}
