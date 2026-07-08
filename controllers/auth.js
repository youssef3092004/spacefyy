import { prisma } from "../configs/db.js";
import bcrypt from "bcrypt";
import process from "process";
import {
  isValidName,
  isValidEmail,
  isValidPassword,
  isValidPhone,
} from "../utils/validation.js";
import { AppError } from "../utils/appError.js";
import jwt from "jsonwebtoken";
import { messages } from "../locales/message.js";
import { compressAndUpload } from "../utils/cloudinary.js";

const getRoleIdOrThrow = async (roleName) => {
  const role = await prisma.role.findUnique({
    where: { name: roleName },
    select: { id: true },
  });

  if (!role) {
    throw new AppError(
      `Role ${roleName} does not exist. Seed roles first.`,
      400,
    );
  }

  return role.id;
};

//! handle it in v2
// import crypto from "crypto";

export const registerOwner = async (req, res, next) => {
  try {
    if (req.user.roleName !== "DEVELOPER") {
      return next(
        new AppError("Forbidden: Only DEVELOPER can register owners", 403),
      );
    }
    const { name, phone, email, password } = req.body;

    const requiredFields = { name, phone, email, password };
    for (let i in requiredFields) {
      if (!requiredFields[i]) {
        return next(
          new AppError(
            `${i.charAt(0).toUpperCase() + i.slice(1)} is required`,
            400,
          ),
        );
      }
    }

    if (!isValidName(name)) {
      return next(new AppError("Invalid name format", 400));
    }
    if (!isValidEmail(email)) {
      return next(new AppError("Invalid email format", 400));
    }
    if (!isValidPassword(password)) {
      return next(new AppError("Weak password format", 400));
    }
    if (!isValidPhone(phone)) {
      return next(new AppError("Invalid phone format", 400));
    }

    const uploadResult = req.file
      ? await compressAndUpload(req.file.buffer, "owners")
      : null;

    const roleId = await getRoleIdOrThrow("OWNER");

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      return next(new AppError("Email already in use", 409));
    }

    const existingPhone = await prisma.user.findUnique({
      where: { phone },
    });

    if (existingPhone) {
      return next(new AppError("Phone number already in use", 409));
    }

    const hashedPassword = await bcrypt.hash(
      password,
      parseInt(process.env.SALT_ROUNDS),
    );

    const newUser = await prisma.user.create({
      data: {
        name,
        phone,
        email,
        password: hashedPassword,
        roleId,
        ...(uploadResult ? { profileImage: uploadResult.secure_url } : {}),
      },
    });

    // eslint-disable-next-line no-unused-vars
    const { password: _, ...userWithoutPassword } = newUser;

    res.status(201).json({
      status: "success",
      data: userWithoutPassword,
    });
  } catch (error) {
    next(error);
  }
};

export const registerAdmin = async (req, res, next) => {
  try {
    const { name, phone, email, password, branchId } = req.body;

    const requiredFields = { name, phone, email, password, branchId };

    for (let i in requiredFields) {
      if (!requiredFields[i]) {
        return next(
          new AppError(
            `${i.charAt(0).toUpperCase() + i.slice(1)} is required`,
            400,
          ),
        );
      }
    }

    if (!isValidName(name)) {
      return next(new AppError("Invalid name format", 400));
    }
    if (!isValidEmail(email)) {
      return next(new AppError("Invalid email format", 400));
    }
    if (!isValidPassword(password)) {
      return next(new AppError("Weak password format", 400));
    }
    if (!isValidPhone(phone)) {
      return next(new AppError("Invalid phone format", 400));
    }

    const existingBranch = await prisma.branch.findUnique({
      where: { id: branchId },
    });
    if (!existingBranch) {
      return next(new AppError("Branch does not exist", 400));
    }

    const uploadResult = req.file
      ? await compressAndUpload(req.file.buffer, "Admins")
      : null;

    const roleId = await getRoleIdOrThrow("ADMIN");

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      return next(new AppError("Email already in use", 409));
    }

    const existingPhone = await prisma.user.findUnique({
      where: { phone },
    });

    if (existingPhone) {
      return next(new AppError("Phone number already in use", 409));
    }

    const hashedPassword = await bcrypt.hash(
      password,
      parseInt(process.env.SALT_ROUNDS),
    );

    const newUser = await prisma.user.create({
      data: {
        name,
        phone,
        email,
        password: hashedPassword,
        roleId,
        ...(uploadResult ? { profileImage: uploadResult.secure_url } : {}),
      },
    });

    const staffProfile = await prisma.staffProfile.create({
      data: {
        baseSalary: 0,
        hireDate: new Date(),
        position: "Pending",
        department: "Pending",
        nationalId: {},
        user: {
          connect: {
            id: newUser.id,
          },
        },
        branch: {
          connect: {
            id: branchId,
          },
        },
      },
    });

    if (!staffProfile) {
      return next(
        new AppError("Failed to create staff profile for the admin user", 500),
      );
    }

    // eslint-disable-next-line no-unused-vars
    const { password: _, ...userWithoutPassword } = newUser;

    res.status(201).json({
      success: true,
      message:
        "Admin registered successfully and created staff profile, please update your profile",
      data: userWithoutPassword,
      staffProfile: staffProfile,
    });
  } catch (error) {
    next(error);
  }
};

export const registerStaff = async (req, res, next) => {
  try {
    const { name, phone, email, password, branchId } = req.body;

    const requiredFields = { name, phone, email, password, branchId };

    for (let i in requiredFields) {
      if (!requiredFields[i]) {
        return next(
          new AppError(
            `${i.charAt(0).toUpperCase() + i.slice(1)} is required`,
            400,
          ),
        );
      }
    }

    if (!isValidName(name)) {
      return next(new AppError("Invalid name format", 400));
    }
    if (!isValidEmail(email)) {
      return next(new AppError("Invalid email format", 400));
    }
    if (!isValidPassword(password)) {
      return next(new AppError("Weak password format", 400));
    }
    if (!isValidPhone(phone)) {
      return next(new AppError("Invalid phone format", 400));
    }

    const uploadResult = req.file
      ? await compressAndUpload(req.file.buffer, "Staffs")
      : null;

    const existingBranch = await prisma.branch.findUnique({
      where: { id: branchId },
    });
    if (!existingBranch) {
      return next(new AppError("Branch does not exist", 400));
    }

    const roleId = await getRoleIdOrThrow("STAFF");

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      return next(new AppError("Email already in use", 409));
    }

    const existingPhone = await prisma.user.findUnique({
      where: { phone },
    });

    if (existingPhone) {
      return next(new AppError("Phone number already in use", 409));
    }

    const hashedPassword = await bcrypt.hash(
      password,
      parseInt(process.env.SALT_ROUNDS),
    );

    const newUser = await prisma.user.create({
      data: {
        name,
        phone,
        email,
        password: hashedPassword,
        roleId,
        ...(uploadResult ? { profileImage: uploadResult.secure_url } : {}),
      },
    });

    // eslint-disable-next-line no-unused-vars
    const { password: _, ...userWithoutPassword } = newUser;

    const staffProfile = await prisma.staffProfile.create({
      data: {
        userId: newUser.id,
        branchId: branchId,
        baseSalary: 0,
        hireDate: new Date(),
        position: "Pending",
        department: "Pending",
      },
    });

    res.status(201).json({
      success: true,
      message:
        "Staff registered successfully & created staff profile & created NationalId, please update your profile",
      data: userWithoutPassword,
      staffProfile: staffProfile,
    });
  } catch (error) {
    next(error);
  }
};

export const registerDeveloper = async (req, res, next) => {
  try {
    if (req.user.roleName !== "DEVELOPER") {
      return next(
        new AppError("Forbidden: Only DEVELOPER can register developers", 403),
      );
    }
    const { name, phone, email, password } = req.body;

    const requiredFields = { name, phone, email, password };

    for (let i in requiredFields) {
      if (!requiredFields[i]) {
        return next(
          new AppError(
            `${i.charAt(0).toUpperCase() + i.slice(1)} is required`,
            400,
          ),
        );
      }
    }

    if (!isValidName(name)) {
      return next(new AppError("Invalid name format", 400));
    }
    if (!isValidEmail(email)) {
      return next(new AppError("Invalid email format", 400));
    }
    if (!isValidPassword(password)) {
      return next(new AppError("Weak password format", 400));
    }
    if (!isValidPhone(phone)) {
      return next(new AppError("Invalid phone format", 400));
    }

    const uploadResult = req.file
      ? await compressAndUpload(req.file.buffer, "Developers")
      : null;

    const roleId = await getRoleIdOrThrow("DEVELOPER");

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      return next(new AppError("Email already in use", 409));
    }

    const existingPhone = await prisma.user.findUnique({
      where: { phone },
    });

    if (existingPhone) {
      return next(new AppError("Phone number already in use", 409));
    }

    const hashedPassword = await bcrypt.hash(
      password,
      parseInt(process.env.SALT_ROUNDS),
    );

    const newUser = await prisma.user.create({
      data: {
        name,
        phone,
        email,
        password: hashedPassword,
        roleId,
        ...(uploadResult ? { profileImage: uploadResult.secure_url } : {}),
      },
    });

    // eslint-disable-next-line no-unused-vars
    const { password: _, ...userWithoutPassword } = newUser;

    res.status(201).json({
      status: "success",
      data: userWithoutPassword,
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const requiredFields = { email, password };
    for (let i in requiredFields) {
      if (!requiredFields[i]) {
        return next(
          new AppError(
            `${i.charAt(0).toUpperCase() + i.slice(1)} is required`,
            400,
          ),
        );
      }
    }
    const user = await prisma.user.findUnique({
      where: { email },
    });
    if (!user) {
      return next(new AppError("Invalid email", 401));
    }
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return next(new AppError("Invalid password", 401));
    }

    // eslint-disable-next-line no-unused-vars
    const { password: _, ...userWithoutPassword } = user;

    const role = await prisma.role.findUnique({
      where: { id: user.roleId },
    });

    const token = jwt.sign(
      {
        id: user.id,
        userId: user.id,
        roleId: user.roleId,
        roleName: role.name,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN },
    );

    res.status(200).json({
      status: "success",
      data: userWithoutPassword,
      token,
    });
  } catch (error) {
    next(error);
  }
};

export const logout = async (req, res, next) => {
  try {
    const token = req.headers.authorization.split(" ")[1];

    const decoded = jwt.decode(token);

    if (!decoded) {
      return next(new AppError("Invalid token", 401));
    }

    //TODO: make it in v2
    //! const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    await prisma.blacklistedToken.create({
      data: {
        token,
        expiredAt: decoded.exp ? new Date(decoded.exp * 1000) : new Date(),
      },
    });
    res.status(200).json({
      status: "success",
      message: "Logged out successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const forgetPassword = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;
    if (userId !== id) {
      return next(new AppError(messages.UNAUTHORIZED, 403));
    }
    const user = await prisma.user.findUnique({
      where: { id },
    });
    if (!user) {
      return next(new AppError(messages.USER_NOT_FOUND, 404));
    }
    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password,
    );
    if (!isPasswordValid) {
      return next(new AppError("Current password is incorrect", 401));
    }
    if (!isValidPassword(newPassword)) {
      return next(new AppError("Weak password format", 400));
    }
    const hashedPassword = await bcrypt.hash(
      newPassword,
      parseInt(process.env.SALT_ROUNDS),
    );
    await prisma.user.update({
      where: { id },
      data: { password: hashedPassword },
    });
    res.status(200).json({
      status: "success",
      message: messages.PASSWORD_CHANGED,
    });
  } catch (error) {
    next(error);
  }
};

// export const resetPassword = async (req, res, next) => {
//   try {
//     const { email, newPassword } = req.body;
//     if (!isValidEmail(email)) {
//       return next(new AppError(messages.INVALID_EMAIL, 400));
//     }
//     if (!isValidPassword(newPassword)) {
//       return next(new AppError(messages.WEAK_PASSWORD, 400));
//     }
//     const user = await prisma.user.findUnique({
//       where: { email },
//     });
//     if (!user) {
//       return next(new AppError(messages.EMAIL_NOT_FOUND, 404));
//     }
//   } catch (error) {
//     next(error);
//   }
// };
