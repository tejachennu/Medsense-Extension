import type { NextFunction, Request, Response } from 'express';
import { config } from './config.js';

declare global {
  namespace Express {
    interface Request {
      auditor?: string;
    }
  }
}

export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const auditor = config.apiKeys.get(req.header('x-api-key') ?? '');
  if (!auditor) return res.status(401).json({ error: 'Invalid or missing X-API-Key' });
  req.auditor = auditor;
  next();
}
