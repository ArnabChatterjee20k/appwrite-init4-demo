import { mysqlTable, int, text, mysqlEnum } from 'drizzle-orm/mysql-core';

export const seats = mysqlTable('seats', {
  id: int('id').autoincrement().primaryKey(),
  label: text('label').notNull(),
  // available -> nobody holds it | booked -> committed, durable
  status: mysqlEnum('status', ['available', 'booked']).notNull().default('available'),
  bookedBy: text('booked_by'),
});

export type Seat = typeof seats.$inferSelect;
