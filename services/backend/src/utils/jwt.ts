import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET; // Se lee el JWT desde .env
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET no está definida en las variables de entorno.');
}

export const generateToken = (userId: string) => {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '1h' });
};

export const verifyToken = (token: string) => {
  return jwt.verify(token, JWT_SECRET);
};

export default {
  generateToken,
  verifyToken,
};
