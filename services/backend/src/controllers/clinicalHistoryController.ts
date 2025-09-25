import { Request, Response, NextFunction } from 'express';
import ClinicalHistoryService from '../services/clinicalHistoryService';

export const listClinicalHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const from = req.query.from ? new Date(req.query.from as string) : undefined;
    const to   = req.query.to   ? new Date(req.query.to as string)   : undefined;
    const id   = (req as any).user!.id; 
    const list = await ClinicalHistoryService.list(id, { from, to });
    res.json(list);
  } catch (err) {
    next(err);
  }
};

export const getClinicalHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id   = (req as any).user!.id; 
    const record = await ClinicalHistoryService.getById(req.params.id, id);
    res.json(record);
  } catch (err) {
    next(err);
  }
};

export const createClinicalHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { doctorName, diagnose } = req.body;
    // collect uploaded files (if the route uses multer)
    const files = Array.isArray((req as any).files) ? (req as any).files : [];
    const id   = (req as any).user!.id;
    // pass the data object to the service (service will sanitize before persisting)
    const created = await ClinicalHistoryService.create(id, { doctorName, diagnose, files });

    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
};