import { type InternDetail, maxPhotoBytes } from '@feedback-portal/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { Camera } from 'lucide-react';
import { type ChangeEvent, useRef, useState } from 'react';
import { isApiError } from '../../api/errors.ts';
import { internQuery, internsQuery, photoUploadTicket, setPhoto } from '../../api/interns.ts';
import { Avatar } from '../../ui/avatar.tsx';
import { Button } from '../../ui/button.tsx';
import { Progress } from '../../ui/progress.tsx';
import { Spinner } from '../../ui/spinner.tsx';
import { type PhotoUpload, UploadCancelled, uploadPhoto } from '../upload-photo.ts';

const photoTypes = ['image/jpeg', 'image/png'];

export type PhotoState =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ kind: 'uploading'; fileName: string; percent: number }>
  | Readonly<{ kind: 'error'; message: string }>;

/** A6-photo's error for a file that can't be a photo (7.7 decision 3). */
export const unsuitableFile = (file: Pick<File, 'name' | 'type' | 'size'>): string | null =>
  photoTypes.includes(file.type) && file.size <= maxPhotoBytes
    ? null
    : `Photo must be a JPG or PNG under 5 MB. ${file.name} wasn't uploaded.`;

/**
 * Checks the file, gets a signed ticket, uploads straight to the storage with progress, then
 * saves it. The profile shows the API's answer, and the roster picks the photo up.
 */
export const usePhotoUpload = (intern: Pick<InternDetail, 'id' | 'batchId'>) => {
  const queryClient = useQueryClient();
  const [state, setState] = useState<PhotoState>({ kind: 'idle' });
  const current = useRef<PhotoUpload | null>(null);

  const start = async (file: File) => {
    const unsuitable = unsuitableFile(file);
    if (unsuitable) {
      setState({ kind: 'error', message: unsuitable });
      return;
    }
    setState({ kind: 'uploading', fileName: file.name, percent: 0 });
    try {
      const ticket = await photoUploadTicket(intern.batchId, intern.id);
      const upload = uploadPhoto(ticket, file, (percent) =>
        setState({ kind: 'uploading', fileName: file.name, percent }),
      );
      current.current = upload;
      const updated = await setPhoto(intern.batchId, intern.id, await upload.done);
      queryClient.setQueryData(internQuery(intern.batchId, intern.id).queryKey, updated);
      await queryClient.invalidateQueries({
        queryKey: internsQuery(intern.batchId).queryKey,
        exact: true,
      });
      setState({ kind: 'idle' });
    } catch (error) {
      if (error instanceof UploadCancelled) {
        setState({ kind: 'idle' });
        return;
      }
      const reason = isApiError(error) ? error.detail : undefined;
      setState({
        kind: 'error',
        message: `${file.name} wasn't uploaded. ${reason ?? 'Try again.'}`,
      });
    } finally {
      current.current = null;
    }
  };

  return { state, start, cancel: () => current.current?.cancel() };
};

/** The profile's 64px avatar; while uploading, dimmed with a 22px spinner over it. */
export const ProfileAvatar = ({
  intern,
  uploading,
}: Readonly<{ intern: Pick<InternDetail, 'name' | 'photoUrl'>; uploading: boolean }>) => (
  <div className="relative size-16 shrink-0">
    <Avatar
      name={intern.name}
      src={intern.photoUrl}
      size="xl"
      className={uploading ? 'opacity-40' : ''}
    />
    {uploading ? (
      <span className="absolute inset-0 flex items-center justify-center">
        <Spinner size={22} />
      </span>
    ) : null}
  </div>
);

/** v2's ghost `sm` "Add photo" / "Change photo" with a 15px camera, over a hidden file input. */
export const PhotoButton = ({
  hasPhoto,
  onFile,
}: Readonly<{ hasPhoto: boolean; onFile: (file: File) => void }>) => {
  const input = useRef<HTMLInputElement>(null);
  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Cleared, so choosing the same file again still counts as a change.
    event.target.value = '';
    if (file) onFile(file);
  };
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => input.current?.click()}>
        <Camera aria-hidden size={15} strokeWidth={2} />
        {hasPhoto ? 'Change photo' : 'Add photo'}
      </Button>
      <input
        ref={input}
        type="file"
        accept={photoTypes.join(',')}
        aria-label="Photo file"
        className="hidden"
        onChange={onChange}
      />
    </>
  );
};

/** A6-photo's uploading state: the file and percentage, a 6px bar, and Cancel (240px wide). */
export const PhotoProgress = ({
  fileName,
  percent,
  onCancel,
}: Readonly<{ fileName: string; percent: number; onCancel: () => void }>) => (
  <div className="flex w-60 flex-col items-start gap-1.5">
    <span className="text-[13px] text-foreground">
      Uploading {fileName} · {Math.round(percent)}%
    </span>
    <Progress value={percent} label={`Uploading ${fileName}`} />
    <Button variant="ghost-muted" size="sm" onClick={onCancel}>
      Cancel
    </Button>
  </div>
);
