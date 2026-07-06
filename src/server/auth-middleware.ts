import { Request, Response, NextFunction } from 'express';
import { OAuth2Client } from 'google-auth-library';

const ALLOWED_DOMAIN = 'risalabs.ai';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

const client = new OAuth2Client(GOOGLE_CLIENT_ID);

export interface AuthenticatedRequest extends Request {
  user?: {
    email: string;
    name: string;
    picture?: string;
  };
}

export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  // Bypass auth in development
  if (process.env.NODE_ENV !== 'production') {
    req.user = { email: 'dev@risalabs.ai', name: 'Dev User' };
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      return res.status(401).json({ error: 'Invalid token payload' });
    }

    const email = payload.email || '';

    // Verify domain
    if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
      return res.status(403).json({ error: `Access restricted to @${ALLOWED_DOMAIN} accounts` });
    }

    req.user = {
      email,
      name: payload.name || '',
      picture: payload.picture,
    };

    next();
  } catch (error) {
    console.error('Auth verification failed:', error);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Optional auth - doesn't block but attaches user if present
export async function optionalAuthMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const idToken = authHeader.split('Bearer ')[1];
    try {
      const ticket = await client.verifyIdToken({
        idToken,
        audience: GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      if (payload) {
        req.user = {
          email: payload.email || '',
          name: payload.name || '',
          picture: payload.picture,
        };
      }
    } catch {
      // Ignore auth errors for optional middleware
    }
  }
  next();
}
