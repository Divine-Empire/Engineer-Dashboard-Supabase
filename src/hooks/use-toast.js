import toast from 'react-hot-toast';

export function useToast() {
  const toastFn = ({ title, description, variant }) => {
    const message = title && description ? `${title}: ${description}` : (title || description || "");
    if (variant === 'destructive') {
      toast.error(message);
    } else {
      toast.success(message);
    }
  };

  toastFn.error = (msg) => toast.error(msg);
  toastFn.success = (msg) => toast.success(msg);

  return {
    toast: toastFn,
  };
}
