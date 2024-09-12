import "./styles.css";

export const NewWindow = () => {
  const windowOptions =
    "menubar=no,toolbar=no,location=no,status=no,scrollbars=no,resizable=yes,width=800,height=600";
  return (
    <div>
      <button
        onClick={(event) => {
          event.preventDefault();
          window.open("/?prebuilt=true", "_blank", windowOptions);
        }}
      >
        Open Prebuilt in New Window
      </button>
    </div>
  );
};
