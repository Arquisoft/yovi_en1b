export type LoginPayload = {
  username: string;
  password: string;
};

export type RegisterPayload = {
  username: string;
  password: string;
};

export type LoginResponse = {
  token: string;
  username: string;
  userId: string;
};

export type RegisterResponse = {
  message: string;
  userId: string;
};

export type ExistsResponse = {
  exists: boolean;
};

export type AuthSession = {
  token: string | null;
  username: string | null;
  userId: string | null;
};

