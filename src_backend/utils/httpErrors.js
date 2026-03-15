export function badRequest(message, details = null) {
    const error = new Error(message);
    error.statusCode = 400;
    error.code = "BAD_REQUEST";
    error.details = details;
    return error;
}

export function notFound(message, details = null) {
    const error = new Error(message);
    error.statusCode = 404;
    error.code = "NOT_FOUND";
    error.details = details;
    return error;
}

export function conflict(message, details = null) {
    const error = new Error(message);
    error.statusCode = 409;
    error.code = "CONFLICT";
    error.details = details;
    return error;
}

export function internalError(message = "Internal server error", details = null) {
    const error = new Error(message);
    error.statusCode = 500;
    error.code = "INTERNAL_ERROR";
    error.details = details;
    return error;
}