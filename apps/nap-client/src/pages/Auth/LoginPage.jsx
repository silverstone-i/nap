/**
 * @file Login page — email/password form with MUI components
 * @module nap-client/pages/Auth/LoginPage
 *
 * Calls AuthContext.login() on submit. Redirects to /dashboard on success.
 * Displays error message for invalid credentials.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
} from '@mui/material';
import { useAuth } from '../../contexts/AuthContext.jsx';
import PasswordField from '../../components/shared/PasswordField.jsx';
import ChangePasswordDialog from '../../components/shared/ChangePasswordDialog.jsx';

export default function LoginPage() {
  const { user, loading: authLoading, login, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [emailAutofilled, setEmailAutofilled] = useState(false);
  const [passwordAutofilled, setPasswordAutofilled] = useState(false);
  const [forceChange, setForceChange] = useState(false);

  // Detect browser autofill — Chrome fires an animation on :-webkit-autofill
  const handleAutofill = (setter) => (e) => {
    if (e.animationName === 'mui-auto-fill') setter(true);
    if (e.animationName === 'mui-auto-fill-cancel') setter(false);
  };

  // Already authenticated — redirect
  if (!authLoading && user) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const res = await login(email, password);
      if (res?.forcePasswordChange) {
        setForceChange(true);
      } else {
        navigate('/dashboard', { replace: true });
      }
    } catch (err) {
      setError(err.payload?.message || err.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        bgcolor: 'background.default',
      }}
    >
      <Card sx={{ width: '100%', maxWidth: 400, mx: 2 }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h4" color="primary" fontWeight={700} textAlign="center" mb={1}>
            NAP
          </Typography>
          <Typography variant="body2" color="text.secondary" textAlign="center" mb={3}>
            Sign in to your account
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} noValidate>
            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              fullWidth
              required
              autoFocus
              autoComplete="email"
              margin="normal"
              size="small"
              InputLabelProps={{ shrink: emailAutofilled || !!email }}
              inputProps={{ onAnimationStart: handleAutofill(setEmailAutofilled) }}
            />
            <PasswordField
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              fullWidth
              required
              autoComplete="current-password"
              margin="normal"
              size="small"
              InputLabelProps={{ shrink: passwordAutofilled || !!password }}
              inputProps={{ onAnimationStart: handleAutofill(setPasswordAutofilled) }}
            />
            <Button
              type="submit"
              variant="contained"
              fullWidth
              disabled={submitting || !email || !password}
              sx={{ mt: 2, py: 1 }}
            >
              {submitting ? <CircularProgress size={20} color="inherit" /> : 'Sign In'}
            </Button>
          </Box>
        </CardContent>
      </Card>

      <ChangePasswordDialog
        open={forceChange}
        forced
        onSuccess={async () => {
          await refreshUser();
          setForceChange(false);
          navigate('/dashboard', { replace: true });
        }}
      />
    </Box>
  );
}
