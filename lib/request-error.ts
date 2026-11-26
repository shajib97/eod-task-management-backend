export class RequestError extends Error {
    constructor(
        readonly status: number,
        message: string,
        readonly code?: string,
    ) {
        super(message);
    }
}
