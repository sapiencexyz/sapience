import { Router, Request, Response } from 'express';
import { handleAsyncErrors } from '../helpers/handleAsyncErrors';
import { validateRequestParams } from '../helpers/validateRequestParams';

const router = Router();

router.get(
  '/',
  validateRequestParams(['jobId', 'serviceId']),
  handleAsyncErrors(async (req: Request, res: Response) => {
    const { jobId, serviceId } = req.query as {
      jobId: string;
      serviceId: string;
    };

    const idRegex = /^[a-zA-Z0-9-_]+$/;
    if (!idRegex.test(jobId) || !idRegex.test(serviceId)) {
      res.status(400).json({ 
        success: false,
        error: 'Invalid jobId or serviceId format'
      });
      return;
    }

    const RENDER_API_KEY = process.env.RENDER_API_KEY;
    if (!RENDER_API_KEY) {
      throw new Error('RENDER_API_KEY not set');
    }

    const url = `https://api.render.com/v1/services/${serviceId}/jobs/${jobId}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${RENDER_API_KEY}`,
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const job = await response.json();
    res.json({ success: true, job });
  })
);

export { router };
