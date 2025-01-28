import { Request, Response, NextFunction } from 'express';

export const validateRequestParams =
  (params: string[]) => (req: Request, res: Response, next: NextFunction) => {
    for (const param of params) {
      if (typeof req.query[param] !== 'string') {
        res.status(400).json({ error: `Invalid parameter: ${param}` });
        return;
      }
    }
    next();
  };
