import { api } from './api';

// Secret Manager. Always talks to the real server (there is no mock for secrets).
export type VaultLevel = 'VIEW' | 'EDIT' | 'MANAGE';
export type SecretType = 'LOGIN' | 'API_KEY' | 'NOTE' | 'FILE';

export interface VaultFolder { id: string; name: string; description: string | null; secretCount: number; myLevel: VaultLevel | null; myAccessExpiresAt: string | null }
export interface VaultSecret { id: string; name: string; type: SecretType; description: string | null; currentVersion: number; expiresAt: string | null; updatedAt: string; fileSize: number | null }
export interface VaultGrant { id: string; userId: string; level: VaultLevel; expiresAt: string | null; expired: boolean; user: { fullName: string; email: string; role: string } | null }
export interface VaultVersion { version: number; reason: string | null; createdAt: string; by: string | null }
export interface Revealed { username?: string; url?: string; value: string; version: number }

const qs = (o: Record<string, string | undefined>) => Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join('&');
const d = <T,>(p: Promise<{ data: { data: T } }>) => p.then((r) => r.data.data);

export const vaultApi = {
  status: () => d<{ enabled: boolean; canCreateFolder: boolean; stepUp: 'code' | 'password' | 'none' }>(api.get('/v1/vault/status')),
  folders: () => d<VaultFolder[]>(api.get('/v1/vault/folders')),
  createFolder: (b: { name: string; description?: string }) => api.post('/v1/vault/folders', b),
  deleteFolder: (id: string) => api.delete(`/v1/vault/folders/${id}`),
  secrets: (folderId: string) => d<{ folder: { id: string; name: string; description: string | null }; myLevel: VaultLevel | null; secrets: VaultSecret[] }>(api.get(`/v1/vault/folders/${folderId}/secrets`)),
  createSecret: (folderId: string, b: Record<string, unknown>) => api.post(`/v1/vault/folders/${folderId}/secrets`, b),
  updateSecret: (id: string, b: Record<string, unknown>) => api.patch(`/v1/vault/secrets/${id}`, b),
  deleteSecret: (id: string) => api.delete(`/v1/vault/secrets/${id}`),
  // files travel as the raw request body; the secret's details go in the query string
  uploadFile: (folderId: string, file: File, o: { name?: string; description?: string; expiresAt?: string }) =>
    api.put(`/v1/vault/folders/${folderId}/secrets/file?${qs({ filename: file.name, ...o })}`, file, { headers: { 'Content-Type': 'application/octet-stream' }, timeout: 300_000 }),
  replaceFile: (id: string, file: File, reason?: string) =>
    api.put(`/v1/vault/secrets/${id}/file?${qs({ filename: file.name, reason })}`, file, { headers: { 'Content-Type': 'application/octet-stream' }, timeout: 300_000 }),
  download: async (id: string, b: { password?: string; code?: string }) => {
    try {
      const r = await api.post(`/v1/vault/secrets/${id}/download`, b, { responseType: 'blob', timeout: 300_000 });
      const m = /filename\*=UTF-8''([^;]+)/i.exec(String(r.headers['content-disposition'] ?? ''));
      return { blob: r.data as Blob, name: m ? decodeURIComponent(m[1]) : 'file' };
    } catch (e: any) {
      // an error body also arrives as a Blob; turn it back into the usual { error: { message } } shape
      if (e?.response?.data instanceof Blob) { try { e.response.data = JSON.parse(await e.response.data.text()); } catch { /* keep as is */ } }
      throw e;
    }
  },
  versions: (id: string) => d<VaultVersion[]>(api.get(`/v1/vault/secrets/${id}/versions`)),
  reveal: (id: string, b: { password?: string; code?: string }) => d<Revealed>(api.post(`/v1/vault/secrets/${id}/reveal`, b)),
  grants: (folderId: string) => d<VaultGrant[]>(api.get(`/v1/vault/folders/${folderId}/grants`)),
  grant: (folderId: string, b: { userId: string; level: VaultLevel; expiresAt?: string | null }) => api.put(`/v1/vault/folders/${folderId}/grants`, b),
  revoke: (folderId: string, userId: string) => api.delete(`/v1/vault/folders/${folderId}/grants/${userId}`),
};
