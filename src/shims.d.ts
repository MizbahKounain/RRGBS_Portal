declare module 'resend' {
  export class Resend {
    constructor(apiKey: string);
    emails: { send(options: any): Promise<{ data?: any; error?: any }> };
  }
}

declare module 'cloudinary' {
  export const v2: any;
}

declare module 'exceljs' {
  const ExcelJS: any;
  export default ExcelJS;
}

declare module 'express-rate-limit' {
  const rateLimit: any;
  export default rateLimit;
}

declare module 'helmet' {
  const helmet: any;
  export default helmet;
}
