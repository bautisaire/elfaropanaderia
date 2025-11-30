.BottomCarModalContainer{
    position: fixed,
    left: 50%,
    transform: translate(-50%, ${showBottomModal ? "0" : "110%"}),
    bottom: 20,
    transition: transform 350ms ease, opacity 350ms ease,
        opacity: showBottomModal ? 1 : 0,
        zIndex: 9999,
        width: min(720px, calc(100% - 32px)),
}