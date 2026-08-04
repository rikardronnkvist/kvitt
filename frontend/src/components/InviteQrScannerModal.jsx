import { useEffect, useRef, useState } from 'react';
import { Camera, Keyboard, Loader2 } from 'lucide-react';
import { BrowserCodeReader, BrowserMultiFormatReader } from '@zxing/browser';
import ModalShell from './ModalShell.jsx';
import { extractInviteToken } from '../lib/inviteToken.js';

function getUserFacingError(message) {
  const lowered = String(message || '').toLowerCase();
  if (lowered.includes('permission') || lowered.includes('denied') || lowered.includes('notallowed')) {
    return 'Kameraåtkomst nekades. Tillåt kamera för att skanna QR-kod.';
  }
  if (lowered.includes('secure') || lowered.includes('https')) {
    return 'Skanning kräver en säker anslutning (https).';
  }
  if (lowered.includes('device') || lowered.includes('camera') || lowered.includes('input')) {
    return 'Ingen kamera hittades på enheten.';
  }
  return 'Kunde inte starta QR-skanning.';
}

export default function InviteQrScannerModal({ onClose, onDetected }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const handledRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [manualInput, setManualInput] = useState('');
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);

  // Load available devices once on mount
  useEffect(() => {
    if (!navigator?.mediaDevices?.getUserMedia) return;

    BrowserCodeReader.listVideoInputDevices()
      .then((videoDevices) => {
        setDevices(videoDevices);
        const preferred = videoDevices.find((device) => /back|rear|environment/i.test(device.label || ''));
        setSelectedDeviceId(preferred?.deviceId || videoDevices[0]?.deviceId || null);
      })
      .catch(() => {});
  }, []);

  // Start scanner when a device is selected
  useEffect(() => {
    if (!selectedDeviceId) return;

    let active = true;
    handledRef.current = false;
    setLoading(true);
    setError('');

    const start = async () => {
      try {
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromVideoDevice(selectedDeviceId, videoRef.current, (result) => {
          if (!result || handledRef.current) return;
          const token = extractInviteToken(result.getText());
          if (!token) return;
          handledRef.current = true;
          controls.stop();
          if (active) {
            onDetected(token);
          }
        });

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

  // Show error if media devices not supported (devices list stays empty after mount)
  useEffect(() => {
    if (!navigator?.mediaDevices?.getUserMedia) {
      setError('Din enhet stödjer inte kameraläsning i webbläsaren.');
      setLoading(false);
    }
  }, []);

  const submitManual = () => {
    const token = extractInviteToken(manualInput);
    if (!token) {
      setError('Kunde inte läsa inbjudan. Klistra in en full inbjudningslänk eller token.');
      return;
    }
    onDetected(token);
  };

  return (
    <ModalShell
      title="Scanna QR-inbjudan"
      description="Rikta kameran mot en Kvitt-inbjudan för att gå med direkt i gruppen."
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
                  {device.label || `Kamera ${index + 1}`}
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
                Startar kamera...
              </span>
            </div>
          ) : null}
        </div>

        <p className="m-0 text-xs text-[var(--text-secondary)]">
          Om skanning inte fungerar kan du klistra in inbjudningslänken manuellt.
        </p>

        <div className="flex gap-2">
          <input
            value={manualInput}
            onChange={(event) => setManualInput(event.target.value)}
            placeholder="Klistra in länk eller token"
          />
          <button type="button" className="btn-secondary shrink-0" onClick={submitManual}>
            <Keyboard className="h-4 w-4" />
            Öppna
          </button>
        </div>

        {error ? (
          <p className="m-0 rounded-lg border border-[color:color-mix(in_srgb,var(--danger)_20%,transparent)] bg-[color:color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-2 text-sm text-[var(--danger)]">
            {error}
          </p>
        ) : (
          <p className="m-0 text-xs text-[var(--text-muted)] inline-flex items-center gap-1">
            <Camera className="h-3.5 w-3.5" />
            Tillåt kameraåtkomst om webbläsaren frågar.
          </p>
        )}
      </div>
    </ModalShell>
  );
}
