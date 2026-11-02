/**
 * 样式类名工具：先展开条件类名，再消解相互冲突的 Tailwind 类。
 */
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
export function cn(...inputs: ClassValue[]): string { return twMerge(clsx(inputs)) }
