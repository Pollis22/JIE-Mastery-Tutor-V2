import { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';

interface AuditAction {
  action: string;
  targetType: 'user' | 'subscription' | 'document' | 'agent' | 'system';
  getTargetId?: (req: Request) => string | undefined;
  getDetails?: (req: Request) => any;
}

export const createAuditLogger = (config: AuditAction) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as any;
    
    if (!user || !user.isAdmin) {
      return next();
    }

    const targetId = config.getTargetId ? config.getTargetId(req) : undefined;
    const details = config.getDetails ? config.getDetails(req) : undefined;

    // Log after response completes successfully (2xx status codes only)
    const originalSend = res.send;
    res.send = function(data: any) {
      res.send = originalSend;
      const result = res.send(data);
      
      // Only log if response was successful (status code 2xx)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        storage.createAdminLog({
          adminId: user.id,
          action: config.action,
          targetType: config.targetType,
          targetId,
          details,
        }).catch(error => {
          console.error('[AuditLog] Failed to log admin action:', error);
        });
      }
      
      return result;
    };

    next();
  };
};

export const auditActions = {
  addMinutes: createAuditLogger({
    action: 'add_minutes',
    targetType: 'user',
    getTargetId: (req) => req.params.id,
    getDetails: (req) => ({ minutes: req.body.minutes }),
  }),
  
  viewUsers: createAuditLogger({
    action: 'view_users',
    targetType: 'system',
    getDetails: (req) => ({ search: req.query.search }),
  }),
  
  exportData: createAuditLogger({
    action: 'export_data',
    targetType: 'system',
  }),
  
  viewSubscriptions: createAuditLogger({
    action: 'view_subscriptions',
    targetType: 'subscription',
  }),
  
  viewDocuments: createAuditLogger({
    action: 'view_documents',
    targetType: 'document',
  }),
  
  viewAnalytics: createAuditLogger({
    action: 'view_analytics',
    targetType: 'system',
  }),
  
  viewLogs: createAuditLogger({
    action: 'view_logs',
    targetType: 'system',
  }),
};
