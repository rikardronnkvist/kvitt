import { useMemo, useState } from 'react';
import Cropper from 'react-easy-crop';
import { t } from '../lib/i18n.js';

const MAX_AVATAR_DIMENSION = 512;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(t('shell.avatarReadFailed')));
    image.src = src;
  });
}

async function createCroppedAvatarDataUrl(imageSource, croppedAreaPixels) {
  const image = await loadImage(imageSource);
  const targetSize = Math.min(
    MAX_AVATAR_DIMENSION,
    Math.max(1, Math.round(croppedAreaPixels.width)),
    Math.max(1, Math.round(croppedAreaPixels.height)),
  );

  const canvas = document.createElement('canvas');
  canvas.width = targetSize;
  canvas.height = targetSize;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error(t('shell.avatarReadFailed'));
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    image,
    croppedAreaPixels.x,
    croppedAreaPixels.y,
    croppedAreaPixels.width,
    croppedAreaPixels.height,
    0,
    0,
    targetSize,
    targetSize,
  );

  return canvas.toDataURL('image/png');
}

export default function AvatarCropperModal({
  open,
  imageSource,
  onClose,
  onConfirm,
  setError,
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [saving, setSaving] = useState(false);

  const zoomLabel = useMemo(() => `${Math.round(zoom * 100)}%`, [zoom]);

  if (!open || !imageSource) {
    return null;
  }

  const handleConfirm = async () => {
    if (!croppedAreaPixels || saving) {
      return;
    }

    setSaving(true);
    try {
      const avatarDataUrl = await createCroppedAvatarDataUrl(imageSource, croppedAreaPixels);
      onConfirm(avatarDataUrl);
    } catch (error) {
      setError(error.message || t('shell.avatarReadFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop app-shell-modal-backdrop">
      <div className="modal-sheet app-shell-modal-sheet md:w-[520px]">
        <div className="space-y-5 p-5 sm:p-6">
          <div className="space-y-1">
            <p className="section-eyebrow">{t('shell.avatarEyebrow')}</p>
            <h2 className="m-0 text-xl font-semibold">{t('shell.avatarCropTitle')}</h2>
          </div>

          <div className="space-y-3">
            <div className="relative h-72 w-full overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-black/70">
              <Cropper
                image={imageSource}
                crop={crop}
                zoom={zoom}
                aspect={1}
                minZoom={1}
                maxZoom={3}
                zoomSpeed={0.1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_croppedArea, nextCroppedAreaPixels) => setCroppedAreaPixels(nextCroppedAreaPixels)}
              />
            </div>

            <label className="field-label">
              <span>{t('shell.avatarZoom')} <span className="text-[var(--text-muted)] font-normal">{zoomLabel}</span></span>
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
              />
            </label>
          </div>

          <div className="flex gap-3">
            <button type="button" className="btn-secondary flex-1" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button type="button" className="btn-primary flex-1" onClick={handleConfirm} disabled={saving || !croppedAreaPixels}>
              {saving ? t('shell.saving') : t('shell.avatarUseImage')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
