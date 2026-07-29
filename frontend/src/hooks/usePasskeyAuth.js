import { useEffect, useState } from 'react';
import {
  checkPasskeyAvailability,
  getPasskeyErrorMessage,
  loginWithPasskey,
  registerWithPasskey,
} from '../auth/passkey.js';

export function usePasskeyAuth({ navigate, setError }) {
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeySupported, setPasskeySupported] = useState(true);

  useEffect(() => {
    let active = true;
    checkPasskeyAvailability()
      .then((available) => {
        if (active) {
          setPasskeySupported(available);
        }
      })
      .catch(() => {
        if (active) {
          setPasskeySupported(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const finishAuth = (data) => {
    localStorage.setItem('token', data.token);
    navigate('/');
  };

  const ensurePasskeySupport = () => {
    if (passkeySupported) {
      return true;
    }

    setError('Din enhet stödjer inte Passkeys');
    return false;
  };

  const handlePasskeySignup = async (displayName, registrationToken) => {
    if (!ensurePasskeySupport()) {
      return;
    }

    setError('');
    setPasskeyLoading(true);
    try {
      const data = await registerWithPasskey(displayName, registrationToken);
      finishAuth(data);
    } catch (error) {
      setError(getPasskeyErrorMessage(error, 'register'));
    } finally {
      setPasskeyLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    if (!ensurePasskeySupport()) {
      return;
    }

    setError('');
    setPasskeyLoading(true);
    try {
      const data = await loginWithPasskey();
      finishAuth(data);
    } catch (error) {
      setError(getPasskeyErrorMessage(error, 'login'));
    } finally {
      setPasskeyLoading(false);
    }
  };

  return {
    passkeyLoading,
    handlePasskeySignup,
    handlePasskeyLogin,
  };
}
