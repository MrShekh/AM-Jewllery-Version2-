import { prisma } from "../prisma";
import { ErpDomainService } from "./erp-service";
import { PrismaErpRepository } from "./prisma-repository";

export const prismaErpRepository = new PrismaErpRepository(prisma);
export const erpService = new ErpDomainService(prismaErpRepository);

export * from "./types";
export * from "./errors";
export * from "./erp-service";
export * from "./repository";
export * from "./prisma-repository";

