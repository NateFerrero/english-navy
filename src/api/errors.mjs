export class ApiError extends Error {
  constructor(message, code = "api_error") {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}
