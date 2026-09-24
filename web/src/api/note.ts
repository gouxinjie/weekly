import { request } from './client';
import type {
  CreateNoteBody,
  NoteListResponse,
  UpdateNoteBody,
} from '@/types/api';
import type { Note } from '@/types/models';

/**
 * 获取全部便签
 * @returns 便签列表，已按「置顶优先、新的在前」排序
 */
export const fetchNotes = (): Promise<NoteListResponse> =>
  request.get<NoteListResponse>('/api/notes');

/**
 * 新建便签
 * @param body - 标题、正文与纸色，均可缺省（先开一张空白便签）
 * @returns 新建的便签
 */
export const createNote = (body: CreateNoteBody): Promise<Note> =>
  request.post<Note>('/api/notes', body);

/**
 * 更新便签（全量提交）
 * @param id - 便签 ID
 * @param body - 完整字段
 * @returns 无
 */
export const updateNote = (id: number, body: UpdateNoteBody): Promise<null> =>
  request.put<null>(`/api/notes/${id}`, body);

/**
 * 删除便签
 * @param id - 便签 ID
 * @returns 无
 */
export const deleteNote = (id: number): Promise<null> =>
  request.delete<null>(`/api/notes/${id}`);
