import { Router } from 'express';
import { authService } from '../services/auth.service';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const authRouter = Router();

authRouter.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const result = await authService.login(username, password);
    res.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof Error && (err.message === 'Invalid credentials' || err.message === 'User deactivated')) {
      const status = err.message === 'Invalid credentials' ? 401 : 403;
      res.status(status).json({ message: err.message });
      return;
    }
    next(err);
  }
});