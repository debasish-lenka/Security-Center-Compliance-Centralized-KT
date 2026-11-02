'use client';

import * as React from 'react';
import * as Slot from '@radix-ui/react-slot';
import { Controller, ControllerProps, FieldPath, FieldValues, UseFormProps, useForm } from 'react-hook-form';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';

const Form = React.forwardRef<HTMLFormElement, React.ComponentPropsWithoutRef<'form'>>(
  ({ ...props }, ref) => <form ref={ref} {...props} />
);
Form.displayName = 'Form';

type FormProviderProps<TFieldValues extends FieldValues> = UseFormProps<TFieldValues> & { children: React.ReactNode };

function FormProvider<TFieldValues extends FieldValues>({ children, ...props }: FormProviderProps<TFieldValues>) {
  return <Form {...props}>{children}</Form>;
}

const FormField = <TFieldValues extends FieldValues = FieldValues, TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>>({
  ...props
}: ControllerProps<TFieldValues, TName>) => <Controller {...props} />;

const FormItem = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('space-y-2', className)} {...props} />
  )
);
FormItem.displayName = 'FormItem';

interface FormLabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {}
const FormLabel = React.forwardRef<HTMLLabelElement, FormLabelProps>(
  ({ className, ...props }, ref) => (
    <Label ref={ref} className={cn('', className)} {...props} />
  )
);
FormLabel.displayName = 'FormLabel';

interface FormControlProps extends React.ComponentPropsWithoutRef<'div'> {
  asChild?: boolean;
}

const FormControl = React.forwardRef<HTMLDivElement, FormControlProps>(
  ({ className, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot.Slot : 'div';
    return (
      <Comp ref={ref} className={cn('', className)} {...props} />
    );
  }
);
FormControl.displayName = 'FormControl';

interface FormDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {}
const FormDescription = React.forwardRef<HTMLParagraphElement, FormDescriptionProps>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
  )
);
FormDescription.displayName = 'FormDescription';

interface FormMessageProps extends React.HTMLAttributes<HTMLParagraphElement> {}
const FormMessage = React.forwardRef<HTMLParagraphElement, FormMessageProps>(
  ({ className, children, ...props }, ref) => (
    <p
      ref={ref}
      className={cn('text-sm font-medium text-destructive', className)}
      {...props}
    >
      {children}
    </p>
  )
);
FormMessage.displayName = 'FormMessage';

export {
  useForm,
  FormProvider,
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
};