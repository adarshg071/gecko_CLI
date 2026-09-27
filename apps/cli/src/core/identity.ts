import fs from 'fs';
import os from 'os';
import path from 'path';
import { AgentIdentity, AgentIdentitySchema } from '../../../../packages/protocol/src/index.js';

const IDENTITY_DIR = path.join(os.homedir(), '.config', 'gecko');
const IDENTITY_FILE = path.join(IDENTITY_DIR, 'identity.json');

export function loadIdentity(): AgentIdentity {
  if (!fs.existsSync(IDENTITY_FILE)) {
    throw new Error('Not connected. Run `gecko connect` first.');
  }
  const raw = JSON.parse(fs.readFileSync(IDENTITY_FILE, 'utf8')) as unknown;
  return AgentIdentitySchema.parse(raw);
}

export function saveIdentity(identity: AgentIdentity): void {
  fs.mkdirSync(IDENTITY_DIR, { recursive: true });
  fs.writeFileSync(IDENTITY_FILE, JSON.stringify(identity, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  });
}

export function removeIdentity(): void {
  if (fs.existsSync(IDENTITY_FILE)) {
    fs.unlinkSync(IDENTITY_FILE);
  }
}

export function hasIdentity(): boolean {
  return fs.existsSync(IDENTITY_FILE);
}
