import { prisma } from '../prisma';
import { FeedbackType, FeedbackStatus } from '@prisma/client';
import { logger } from '../logger';

export type FeedbackTypeValue = 'BUG' | 'IMPROVEMENT';
export type FeedbackStatusValue = 'NEW' | 'DONE';

export interface FeedbackInput {
  type: FeedbackTypeValue;
  content: string;
  status?: FeedbackStatusValue;
}

export interface FeedbackUpdateItem {
  id?: string;
  type: FeedbackTypeValue;
  content: string;
  status: FeedbackStatusValue;
}

export interface FeedbackBulkUpdateInput {
  items: FeedbackUpdateItem[];
}

export const feedbackService = {
  // Lấy danh sách tất cả feedback, sắp xếp theo createdAt desc
  async list() {
    const items = await prisma.feedback.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        createdByUser: { select: { id: true, fullName: true } },
      },
    });
    return items;
  },

  // Tạo mới 1 feedback
  async create(data: FeedbackInput, userId: string) {
    const result = await prisma.feedback.create({
      data: {
        type: data.type as FeedbackType,
        content: data.content,
        status: (data.status as FeedbackStatus) || FeedbackStatus.NEW,
        createdBy: userId,
      },
    });
    logger.info(`Feedback created: id=${result.id} type=${result.type} by=${userId}`);
    return result;
  },

  // Cập nhật hàng loạt (update nếu có id, tạo mới nếu không)
  async bulkUpdate(data: FeedbackBulkUpdateInput, userId: string) {
    const results: { id: string; type: string; content: string; status: string; action: string }[] = [];

    for (const item of data.items) {
      if (item.id) {
        const updated = await prisma.feedback.update({
          where: { id: item.id },
          data: {
            type: item.type as FeedbackType,
            content: item.content,
            status: item.status as FeedbackStatus,
          },
        });
        results.push({
          id: updated.id,
          type: updated.type,
          content: updated.content,
          status: updated.status,
          action: 'updated',
        });
      } else {
        const created = await prisma.feedback.create({
          data: {
            type: item.type as FeedbackType,
            content: item.content,
            status: item.status as FeedbackStatus,
            createdBy: userId,
          },
        });
        results.push({
          id: created.id,
          type: created.type,
          content: created.content,
          status: created.status,
          action: 'created',
        });
      }
    }

    logger.info(`Feedback bulkUpdate: ${results.length} items processed by=${userId}`);
    return results;
  },

  // Xóa 1 feedback
  async delete(id: string) {
    const result = await prisma.feedback.delete({ where: { id } });
    logger.info(`Feedback deleted: id=${id}`);
    return result;
  },
};