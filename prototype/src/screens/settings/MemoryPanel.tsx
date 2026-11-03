import { useState } from 'react';
import { en } from '../../i18n/en';
import { useServices } from '../../app/services';
import { Dialog } from '../../components/Dialog';
import { TextField } from '../../components/TextField';
import { SimBadge } from '../../components/SimBadge';

/** Memory-wide actions. "Forget everything" needs a typed confirmation. */
export function MemoryPanel() {
  const { memory } = useServices();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const close = () => {
    setOpen(false);
    setTyped('');
  };
  return (
    <div className="panel stack">
      <div className="row gap"><h3>{en.settings.forget}</h3><SimBadge compact /></div>
      <p className="small faint">{en.settings.forgetWarn}</p>
      <div className="row gap wrap">
        <button type="button" className="btn btn-danger" onClick={() => setOpen(true)}>
          {en.settings.forget}
        </button>
        <button type="button" className="btn" onClick={() => memory.restoreSamples()}>
          {en.settings.restoreSamples}
        </button>
      </div>
      {open ? (
        <Dialog
          title={en.settings.forget}
          onClose={close}
          footer={
            <>
              <button type="button" className="btn" onClick={close}>
                {en.settings.cancel}
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={typed !== 'FORGET'}
                onClick={() => {
                  memory.forgetAll();
                  close();
                }}
              >
                {en.settings.forget}
              </button>
            </>
          }
        >
          <p>{en.settings.forgetWarn}</p>
          <TextField label="Type FORGET" value={typed} onChange={setTyped} help="Case sensitive." />
        </Dialog>
      ) : null}
    </div>
  );
}
