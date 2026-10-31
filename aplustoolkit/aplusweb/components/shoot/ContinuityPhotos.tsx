'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { newId } from '@aplus/shoot/set';
import { deletePhoto, listPhotos, savePhoto, shrinkImage, type ContinuityPhoto } from '@/lib/shoot/photos';
import styles from './Shoot.module.css';

interface Shown extends ContinuityPhoto {
  url: string;
}

/**
 * Continuity photos for one scene: take one with the iPad's camera or pick
 * one from the library, write what it shows, tap to see it full size.
 */
export function ContinuityPhotos({ projectId, sceneKey, ensureKey }: { projectId: string; sceneKey: string | null; ensureKey: () => string }) {
  const t = useTranslations('shoot.set');
  const locale = useLocale();
  const [photos, setPhotos] = useState<Shown[]>([]);
  const [viewing, setViewing] = useState<Shown | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (key: string | null) => {
    if (!key) return [];
    try {
      return (await listPhotos(projectId, key)).map((photo) => ({ ...photo, url: URL.createObjectURL(photo.blob) }));
    } catch {
      setFailed(true);
      return [];
    }
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    let shown: Shown[] = [];
    void load(sceneKey).then((list) => {
      if (cancelled) list.forEach((p) => URL.revokeObjectURL(p.url));
      else {
        shown = list;
        setPhotos(list);
      }
    });
    return () => {
      cancelled = true;
      shown.forEach((p) => URL.revokeObjectURL(p.url));
    };
  }, [sceneKey, load]);

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const key = sceneKey ?? ensureKey();
    try {
      const added: Shown[] = [];
      for (const file of Array.from(files)) {
        const blob = await shrinkImage(file);
        const photo: ContinuityPhoto = { id: newId('p'), projectId, scene: key, caption: '', at: Date.now(), blob };
        await savePhoto(photo);
        added.push({ ...photo, url: URL.createObjectURL(blob) });
      }
      setPhotos((list) => [...list, ...added]);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const caption = (photo: Shown, text: string) => {
    setPhotos((list) => list.map((p) => (p.id === photo.id ? { ...p, caption: text } : p)));
    const { url: _url, ...stored } = photo;
    void savePhoto({ ...stored, caption: text });
  };

  const remove = async (photo: Shown) => {
    if (!window.confirm(t('deletePhoto'))) return;
    await deletePhoto(photo.id);
    URL.revokeObjectURL(photo.url);
    setPhotos((list) => list.filter((p) => p.id !== photo.id));
  };

  return (
    <div className={styles.card}>
      <div className={styles.row} style={{ marginBottom: photos.length ? 'var(--s-3)' : 0 }}>
        <label className={`${styles.button} ${styles.fileButton}`}>
          {busy ? t('saving') : t('takePhoto')}
          <input type="file" accept="image/*" capture="environment" onChange={(e) => void add(e.target.files).then(() => (e.target.value = ''))} disabled={busy} />
        </label>
        <label className={`${styles.ghost} ${styles.fileButton}`}>
          {t('pickPhoto')}
          <input type="file" accept="image/*" multiple onChange={(e) => void add(e.target.files).then(() => (e.target.value = ''))} disabled={busy} />
        </label>
        <span className={styles.faint}>{t('photosLocal')}</span>
      </div>
      {failed && <p className={styles.faint}>{t('photosFailed')}</p>}
      {photos.length > 0 && (
        <div className={styles.photos}>
          {photos.map((photo) => (
            <figure key={photo.id} className={styles.photo}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a local blob, nothing for next/image to optimise */}
              <img src={photo.url} alt={photo.caption || t('continuity')} onClick={() => setViewing(photo)} />
              <input className={styles.input} value={photo.caption} placeholder={t('caption')} onChange={(e) => caption(photo, e.target.value)} />
              <span className={styles.row}>
                <span className={`${styles.faint} ${styles.grow}`}>{new Date(photo.at).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                <button type="button" className={styles.ghost} onClick={() => void remove(photo)} aria-label={t('delete')}>
                  ✕
                </button>
              </span>
            </figure>
          ))}
        </div>
      )}
      {viewing && (
        <div className={styles.viewer} onClick={() => setViewing(null)} role="dialog" aria-label={viewing.caption || t('continuity')}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={viewing.url} alt={viewing.caption} />
        </div>
      )}
    </div>
  );
}
