import styled from "styled-components";

const StyledQuickLook = styled.div`
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;

  .ql-window {
    background: rgba(30, 30, 30, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 10px;
    box-shadow:
      0 20px 60px rgba(0, 0, 0, 0.5),
      0 0 0 0.5px rgba(255, 255, 255, 0.1);
    display: flex;
    flex-direction: column;
    max-height: 80vh;
    max-width: 80vw;
    min-height: 300px;
    min-width: 400px;
    overflow: hidden;
  }

  .ql-titlebar {
    align-items: center;
    background: rgba(40, 40, 40, 0.95);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    flex-shrink: 0;
    height: 36px;
    justify-content: center;
    padding: 0 12px;
    position: relative;
    user-select: none;

    span {
      color: rgba(255, 255, 255, 0.85);
      font-size: 13px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    button {
      align-items: center;
      background: #ff5f57;
      border: none;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      height: 12px;
      justify-content: center;
      left: 12px;
      padding: 0;
      position: absolute;
      width: 12px;

      &:hover {
        background: #ff3b30;
      }
    }
  }

  .ql-content {
    align-items: center;
    display: flex;
    flex: 1;
    justify-content: center;
    overflow: hidden;
    padding: 16px;
    position: relative;

    img {
      max-height: 100%;
      max-width: 100%;
      object-fit: contain;
      user-select: none;
      -webkit-user-drag: none;
    }
  }

  .ql-counter {
    color: rgba(255, 255, 255, 0.5);
    font-size: 12px;
    padding: 6px 0 10px;
    text-align: center;
  }
`;

export default StyledQuickLook;
