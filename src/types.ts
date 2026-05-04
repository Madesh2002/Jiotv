export interface JioResponse {
    status: 'success' | 'error';
    message: string;
    data?: any;
}

export type Screen = 'LOGIN' | 'OTP_VERIFY' | 'SUCCESS';
