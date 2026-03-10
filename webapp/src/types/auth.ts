export type LoginPayload = {
  username: string;
  password: string;
};

export type LoginResponse = {
  token: string;
  username: string;
  userId: string;
};

export type AuthState = {
  token: string | null;
  username: string | null;
  userId: string | null;
};

export type RegisterPayload = {
  username: string;
  password: string;
};

export type RegisterResponse = {
  message: string;
  userId: string;
};

export type VerifyNameResponse = {
  exists: boolean;
};


