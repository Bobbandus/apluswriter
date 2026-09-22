'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/icons/Icon';
import { getSupabase } from '@/lib/supabase/client';
import {
  createShareLink,
  inviteMember,
  listMembers,
  listShareLinks,
  removeMember,
  revokeShareLink,
  type Member,
  type ProjectRole,
  type ShareLink,
  type SharePermission,
} from '@/lib/sharing';
import type { ProjectMeta } from '@/lib/storage/types';
import styles from './ShareSheet.module.css';

export interface ShareSheetProps {
  /** The project to share, or null while closed. */
  project: ProjectMeta | null;
  onClose: () => void;
}

const ROLES: Exclude<ProjectRole, 'owner'>[] = ['viewer', 'commenter', 'editor'];

/** Value in milliseconds, or 'never'. */
const EXPIRY_OPTIONS = ['never', String(24 * 60 * 60 * 1000), String(7 * 24 * 60 * 60 * 1000), String(30 * 24 * 60 * 60 * 1000)] as const;

/**
 * Two kinds of sharing for one project: named collaborators with a role
 * (`project_members`, added by email — needs an existing A+ Toolkit account),
 * and anonymous links (`share_links` — anyone with the token, no account).
 *
 * What a writer sees here depends on their own role, worked out from the
 * member list itself rather than trusted from outside: only an owner may
 * invite or remove, and only an owner or editor may manage links. A viewer
 * or commenter sees who else is on the project and nothing more.
 */
export function ShareSheet({ project, onClose }: ShareSheetProps) {
  const t = useTranslations('share');

  const [members, setMembers] = useState<Member[] | null>(null);
  const [links, setLinks] = useState<ShareLink[] | null>(null);
  const [myRole, setMyRole] = useState<ProjectRole | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Exclude<ProjectRole, 'owner'>>('viewer');
  const [inviting, setInviting] = useState(false);

  const [linkPermission, setLinkPermission] = useState<SharePermission>('view');
  const [linkExpiry, setLinkExpiry] = useState<(typeof EXPIRY_OPTIONS)[number]>('never');
  const [creatingLink, setCreatingLink] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const permissionLabel = (permission: SharePermission) => (permission === 'comment' ? t('permissionComment') : t('permissionView'));

  const load = useCallback(async (id: string) => {
    setError(null);
    const client = getSupabase();
    const [{ data: user }, memberRows] = await Promise.all([client?.auth.getUser() ?? { data: { user: null } }, listMembers(id)]);
    setMembers(memberRows);
    setMyRole(memberRows.find((m) => m.userId === user?.user?.id)?.role ?? null);
    try {
      setLinks(await listShareLinks(id));
    } catch {
      // Not an owner or editor: RLS returns nothing rather than an error, but
      // a direct call can still throw offline. Either way, no links to show.
      setLinks([]);
    }
  }, []);

  useEffect(() => {
    if (project) void load(project.id);
    else {
      setMembers(null);
      setLinks(null);
      setMyRole(null);
      setEmail('');
      setError(null);
    }
  }, [project, load]);

  if (!project) return null;

  const canManageMembers = myRole === 'owner';
  const canManageLinks = myRole === 'owner' || myRole === 'editor';

  const invite = async () => {
    if (!email.trim()) return;
    setInviting(true);
    setError(null);
    try {
      await inviteMember(project.id, email.trim(), role);
      setEmail('');
      await load(project.id);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setInviting(false);
    }
  };

  const remove = async (userId: string) => {
    setError(null);
    try {
      await removeMember(project.id, userId);
      await load(project.id);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  const makeLink = async () => {
    setCreatingLink(true);
    setError(null);
    try {
      const expiresAt = linkExpiry === 'never' ? null : Date.now() + Number(linkExpiry);
      await createShareLink(project.id, linkPermission, expiresAt);
      await load(project.id);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setCreatingLink(false);
    }
  };

  const revoke = async (token: string) => {
    setError(null);
    try {
      await revokeShareLink(token);
      await load(project.id);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  const urlFor = (token: string) => `${window.location.origin}/delad/${token}`;

  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(urlFor(token));
      setCopied(token);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      // No clipboard permission: the address is on screen to select by hand.
    }
  };

  return (
    <Sheet open title={t('title')} onClose={onClose} width={520}>
      <div className={styles.group}>
        <p className={styles.groupTitle}>{t('members')}</p>

        {members === null ? (
          <p className={styles.note}>{t('loading')}</p>
        ) : (
          <ul className={styles.memberList}>
            {members.map((member) => (
              <li key={member.userId} className={styles.member}>
                <Icon name="user" size={14} />
                <span className={styles.memberName}>{member.name ?? t('unnamed')}</span>
                <span className={styles.roleBadge}>{t(`role.${member.role}`)}</span>
                {canManageMembers && member.role !== 'owner' && (
                  <button type="button" className={styles.remove} onClick={() => void remove(member.userId)} aria-label={t('remove')}>
                    <Icon name="trash" size={13} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {canManageMembers && (
          <div className={styles.invite}>
            <input
              className={styles.input}
              type="email"
              placeholder={t('emailPlaceholder')}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && void invite()}
            />
            <select className={styles.roleSelect} value={role} onChange={(event) => setRole(event.target.value as typeof role)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(`role.${r}`)}
                </option>
              ))}
            </select>
            <Button variant="secondary" size="sm" disabled={inviting || !email.trim()} onClick={() => void invite()}>
              {inviting ? t('inviting') : t('invite')}
            </Button>
          </div>
        )}
        <p className={styles.hint}>{t('inviteHint')}</p>
      </div>

      {canManageLinks && (
        <div className={styles.group}>
          <p className={styles.groupTitle}>{t('links')}</p>
          <p className={styles.hint}>{t('linksHint')}</p>

          {links && links.length > 0 && (
            <ul className={styles.linkList}>
              {links.map((link) => (
                <li key={link.token} className={styles.link}>
                  <Icon name="share" size={14} />
                  <span className={styles.linkPermission}>
                    {permissionLabel(link.permission)}
                    {link.expiresAt && ` · ${t('expiry')} ${new Date(link.expiresAt).toLocaleDateString()}`}
                  </span>
                  <button type="button" className={styles.copy} onClick={() => void copy(link.token)}>
                    {copied === link.token ? t('copied') : t('copyLink')}
                  </button>
                  <button type="button" className={styles.remove} onClick={() => void revoke(link.token)} aria-label={t('revoke')}>
                    <Icon name="trash" size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className={styles.newLink}>
            <select
              className={styles.roleSelect}
              value={linkPermission}
              onChange={(event) => setLinkPermission(event.target.value as SharePermission)}
              aria-label={t('permission')}
            >
              <option value="view">{t('permissionView')}</option>
              <option value="comment">{t('permissionComment')}</option>
            </select>
            <select
              className={styles.roleSelect}
              value={linkExpiry}
              onChange={(event) => setLinkExpiry(event.target.value as typeof linkExpiry)}
              aria-label={t('expiry')}
            >
              <option value="never">{t('noExpiry')}</option>
              {EXPIRY_OPTIONS.slice(1).map((ms) => (
                <option key={ms} value={ms}>
                  {Math.round(Number(ms) / (24 * 60 * 60 * 1000))} d
                </option>
              ))}
            </select>
            <Button variant="secondary" size="sm" disabled={creatingLink} onClick={() => void makeLink()}>
              {t('createLink')}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </Sheet>
  );
}
