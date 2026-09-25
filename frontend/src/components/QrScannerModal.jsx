import { useEffect, useRef, useState } from 'react';
import { Camera, Keyboard, Loader2 } from 'lucide-react';
import { BrowserCodeReader, BrowserMultiFormatReader } from '@zxing/browser';
import ModalShell from './ModalShell.jsx';
import ErrorMessage from './ErrorMessage.jsx';
import { t } from '../lib/i18n.js';

const ENVIRONMENT_CAMERA = '__environment__';

function getUserFacingError(message) {
  const lowered = String(message || '').toLowerCase();
  if (lowered.includes('permission') || lowered.includes('denied') || lowered.includes('notallowed')) {
    return t('scanner.permissionDenied');
  }
  if (lowered.includes('secure') || lowered.includes('https')) {
    return t('scanner.secureRequired');
  }
  if (lowered.includes('device') || lowered.includes('camera') || lowered.includes('input')) {
    return t('scanner.cameraNotFound');
  }
  return t('scanner.startFailed');
}

export default function QrScannerModal({ onClose, onDetected }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const handledRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [manualInput, setManualInput] = useState('');
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);

  useEffect(() => {
    if (!navigator?.mediaDevices?.getUserMedia) return;

    BrowserCodeReader.listVideoInputDevices()
      .then((videoDevices) => {
        const validDevices = videoDevices.filter((d) => d.deviceId);
        setDevices(validDevices);
        const preferred = validDevices.find((device) => /back|rear|environment/i.test(device.label || ''));
        setSelectedDeviceId(preferred?.deviceId || validDevices[0]?.deviceId || ENVIRONMENT_CAMERA);
      })
      .catch(() => {
        setSelectedDeviceId(ENVIRONMENT_CAMERA);
      });
  }, []);

  useEffect(() => {
    if (!selectedDeviceId) return;

    let active = true;
    handledRef.current = false;
    setLoading(true);
    setError('');

    const start = async () => {
      try {
        const reader = new BrowserMultiFormatReader();
        const onResult = (result) => {
          if (!result || handledRef.current) return;
          handledRef.current = true;
          controlsRef.current?.stop();
          if (active) onDetected(result.getText());
        };

        let controls;
        if (selectedDeviceId === ENVIRONMENT_CAMERA) {
          controls = await reader.decodeFromConstraints(
            { video: { facingMode: { ideal: 'environment' } } },
            videoRef.current,
            onResult,
          );
          if (active) {
            BrowserCodeReader.listVideoInputDevices()
              .then((videoDevices) => {
                const validDevices = videoDevices.filter((d) => d.deviceId);
                if (active && validDevices.length > 0) setDevices(validDevices);
              })
              .catch(() => {});
          }
        } else {
          controls = await reader.decodeFromVideoDevice(selectedDeviceId, videoRef.current, onResult);
        }

        if (!active) {
          controls.stop();
          return;
        }

        controlsRef.current = controls;
        setError('');
      } catch (scannerError) {
        if (!active) return;
        setError(getUserFacingError(scannerError?.message));
      } finally {
        if (active) setLoading(false);
      }
    };

    start();

    return () => {
      active = false;
      handledRef.current = true;
      controlsRef.current?.stop();
    };
  }, [onDetected, selectedDeviceId]);

  useEffect(() => {
    if (!navigator?.mediaDevices?.getUserMedia) {
      setError(t('scanner.deviceUnsupported'));
      setLoading(false);
    }
  }, []);

  const submitManual = () => {
    const value = manualInput.trim();
    if (!value) {
      setError(t('scanner.invalidCode'));
      return;
    }
    onDetected(value);
  };

  return (
    <ModalShell
      title={t('scanner.modalTitle')}
      description={t('scanner.modalDescription')}
      onClose={onClose}
    >
      <div className="space-y-4">
        {devices.length > 1 ? (
          <div className="flex items-center gap-2">
            <Camera className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" />
            <select
              className="flex-1"
              value={selectedDeviceId || ''}
              onChange={(event) => {
                controlsRef.current?.stop();
                setSelectedDeviceId(event.target.value);
              }}
            >
              {devices.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || t('scanner.camera', { number: index + 1 })}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="relative overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-black">
          <video ref={videoRef} className="h-64 w-full object-cover" muted playsInline autoPlay />
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white">
              <span className="inline-flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('scanner.startingCamera')}
              </span>
            </div>
          ) : null}
        </div>

        <p className="m-0 text-xs text-[var(--text-secondary)]">{t('scanner.manualHelp')}</p>

        <div className="flex gap-2">
          <input
            value={manualInput}
            onChange={(event) => setManualInput(event.target.value)}
            placeholder={t('scanner.manualPlaceholder')}
          />
          <button type="button" className="btn-secondary shrink-0" onClick={submitManual}>
            <Keyboard className="h-4 w-4" />
            {t('scanner.open')}
          </button>
        </div>

        {error ? (
          <ErrorMessage message={error} className="m-0" />
        ) : (
          <p className="m-0 inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
            <Camera className="h-3.5 w-3.5" />
            {t('scanner.allowCameraHint')}
          </p>
        )}
      </div>
    </ModalShell>
  );
}