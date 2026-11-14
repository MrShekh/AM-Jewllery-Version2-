export class ErpError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(message: string, code = "ERP_ERROR", statusCode = 400) {
    super(message);
    this.name = "ErpError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class UnauthorizedError extends ErpError {
  constructor(message = "Authentication required") {
    super(message, "UNAUTHORIZED", 401);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends ErpError {
  constructor(message = "Insufficient permissions or cross-organization access denied") {
    super(message, "FORBIDDEN", 403);
    this.name = "ForbiddenError";
  }
}

export class ValidationError extends ErpError {
  constructor(message: string, code = "VALIDATION_ERROR") {
    super(message, code, 422);
    this.name = "ValidationError";
  }
}

export class ConflictError extends ErpError {
  constructor(message: string, code = "CONFLICT_ERROR") {
    super(message, code, 409);
    this.name = "ConflictError";
  }
}

export class NotFoundError extends ErpError {
  constructor(message: string) {
    super(message, "NOT_FOUND", 404);
    this.name = "NotFoundError";
  }
}

