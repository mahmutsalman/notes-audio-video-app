import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

interface NotesEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const modules = {
  toolbar: [
    ['bold', 'italic', 'underline', 'strike'],
    [{ color: [] }],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['blockquote', 'code-block'],
    ['link'],
    ['clean'],
  ],
};

const formats = [
  'bold',
  'italic',
  'underline',
  'strike',
  'color',
  'list',
  'blockquote',
  'code-block',
  'link',
];

export default function NotesEditor({ value, onChange, placeholder }: NotesEditorProps) {
  return (
    <div className="notes-editor">
      <ReactQuill
        theme="snow"
        value={value}
        onChange={onChange}
        modules={modules}
        formats={formats}
        placeholder={placeholder}
      />
    </div>
  );
}
