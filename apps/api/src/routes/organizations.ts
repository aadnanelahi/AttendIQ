import type { FastifyInstance } from 'fastify';
import { branchSchema, departmentSchema, legalEntitySchema, locationSchema, orgSchema } from '@attendiq/shared';
import { prisma } from '../lib/db.js';
import { registerCrud } from '../lib/crud.js';

export function registerOrgRoutes(app: FastifyInstance): void {
  registerCrud(app, '/organizations', {
    delegate: prisma.organization,
    createSchema: orgSchema,
    resource: 'organization',
    permissionWrite: 'org.write',
    permissionRead: 'org.read',
    searchFields: ['name', 'legalName'],
    include: { legalEntities: true },
  });

  registerCrud(app, '/legal-entities', {
    delegate: prisma.legalEntity,
    createSchema: legalEntitySchema,
    resource: 'legal_entity',
    permissionWrite: 'org.write',
    permissionRead: 'org.read',
    searchFields: ['name'],
  });

  registerCrud(app, '/branches', {
    delegate: prisma.branch,
    createSchema: branchSchema,
    resource: 'branch',
    permissionWrite: 'branch.write',
    permissionRead: 'branch.read',
    searchFields: ['name', 'code'],
    include: { locations: true, departments: true },
  });

  registerCrud(app, '/departments', {
    delegate: prisma.department,
    createSchema: departmentSchema,
    resource: 'department',
    permissionWrite: 'department.write',
    permissionRead: 'department.read',
    searchFields: ['name', 'code'],
  });

  registerCrud(app, '/locations', {
    delegate: prisma.location,
    createSchema: locationSchema,
    resource: 'location',
    permissionWrite: 'location.write',
    permissionRead: 'location.read',
    searchFields: ['name'],
  });
}